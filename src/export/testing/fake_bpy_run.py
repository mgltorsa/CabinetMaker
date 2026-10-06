"""Run import_to_home_builder.py against a stand-in for Blender's bpy module.

Usage: python3 fake_bpy_run.py <script> <bundle dir> <library dir>

This checks the script's control flow, path handling and the calls it makes;
it does not prove the real Blender API behaves the same way. The fake glTF
importer really parses each GLB (header + JSON chunk) and creates one object
per node, so a GLB the script cannot read fails here too. Each "written"
.blend is a JSON description of the data blocks passed to libraries.write.
The last stdout line is "HARNESS <json>" with the exit status and leftovers.
"""

from __future__ import annotations

import json
import runpy
import struct
import sys
import types
from typing import Any

GLB_MAGIC = 0x46546C67
GLB_VERSION = 2
CHUNK_JSON = 0x4E4F534A


class FakeID:
    def __init__(self, name: str, kind: str) -> None:
        self.name = name
        self.kind = kind
        self.props: dict[str, Any] = {}
        self.asset_data: FakeAssetData | None = None
        self.preview: FakePreview | None = None
        self.generated_preview = False
        self.users = 0

    def __setitem__(self, key: str, value: Any) -> None:
        self.props[key] = value

    def __getitem__(self, key: str) -> Any:
        return self.props[key]

    def asset_mark(self) -> None:
        self.asset_data = FakeAssetData()

    def asset_generate_preview(self) -> None:
        self.generated_preview = True

    def preview_ensure(self) -> FakePreview:
        if self.preview is None:
            self.preview = FakePreview()
        return self.preview


class FakeTags(list):
    def new(self, name: str, skip_if_exists: bool = False) -> str:
        if not (skip_if_exists and name in self):
            self.append(name)
        return name


class FakeAssetData:
    def __init__(self) -> None:
        self.description = ""
        self.tags = FakeTags()


class FakePreview:
    def __init__(self) -> None:
        self.image_size = (0, 0)
        self.image_pixels_float: list[float] = []


class FakeLinks(list):
    def link(self, block: Any) -> None:
        self.append(block)

    def unlink(self, block: Any) -> None:
        self.remove(block)


class FakeCollection(FakeID):
    def __init__(self, name: str) -> None:
        super().__init__(name, "collection")
        self.objects = FakeLinks()
        self.children = FakeLinks()


class FakeObject(FakeID):
    def __init__(self, name: str, owner: FakeCollection) -> None:
        super().__init__(name, "object")
        owner.objects.link(self)

    @property
    def users_collection(self) -> list[FakeCollection]:
        return [c for c in DATA.collections_all() if self in c.objects]


class FakeScene(FakeID):
    def __init__(self, name: str) -> None:
        super().__init__(name, "scene")
        self.collection = FakeCollection("Scene Collection")


class FakeImage(FakeID):
    def __init__(self, path: str) -> None:
        super().__init__(path, "image")
        with open(path, "rb") as handle:
            header = handle.read(24)
        width, height = struct.unpack(">II", header[16:24])
        self.size = (width, height)
        self.pixels = [0.5] * (width * height * 4)

    def scale(self, width: int, height: int) -> None:
        self.size = (width, height)
        self.pixels = [0.5] * (width * height * 4)


class FakeBlocks(list):
    def __init__(self, factory: Any) -> None:
        super().__init__()
        self.factory = factory

    def new(self, name: str) -> Any:
        block = self.factory(name)
        self.append(block)
        return block

    def load(self, path: str, check_existing: bool = False) -> Any:
        return self.new(path)

    def remove(self, block: Any, do_unlink: bool = False) -> None:
        if do_unlink:
            for owner in DATA.collections_all():
                if block in owner.objects:
                    owner.objects.unlink(block)
        list.remove(self, block)


def describe(block: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"kind": block.kind, "name": block.name, "props": block.props}
    if block.asset_data is not None:
        out["asset"] = {"description": block.asset_data.description, "tags": list(block.asset_data.tags)}
    if block.preview is not None:
        out["preview"] = {"size": list(block.preview.image_size), "pixels": len(block.preview.image_pixels_float)}
    out["generatedPreview"] = block.generated_preview
    if isinstance(block, FakeCollection):
        out["objects"] = [o.name for o in block.objects]
    if isinstance(block, FakeScene):
        out["children"] = [c.name for c in block.collection.children]
    return out


class FakeLibraries:
    def __init__(self) -> None:
        self.writes: list[str] = []

    def write(
        self, path: str, datablocks: set[Any], path_remap: str = "NONE", fake_user: bool = False, compress: bool = False
    ) -> None:
        blocks = sorted((describe(b) for b in datablocks), key=lambda d: d["kind"])
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"blocks": blocks, "compress": compress, "pathRemap": path_remap}, handle)
        self.writes.append(path)


class FakeData:
    def __init__(self) -> None:
        self.scene = FakeScene("Scene")
        self.objects = FakeBlocks(lambda name: FakeObject(name, self.scene.collection))
        self.meshes = FakeBlocks(lambda name: FakeID(name, "mesh"))
        self.materials = FakeBlocks(lambda name: FakeID(name, "material"))
        self.collections = FakeBlocks(FakeCollection)
        self.scenes = FakeBlocks(FakeScene)
        self.images = FakeBlocks(FakeImage)
        self.libraries = FakeLibraries()

    def collections_all(self) -> list[FakeCollection]:
        return [self.scene.collection, *self.collections, *(s.collection for s in self.scenes)]


DATA = FakeData()


def read_glb_json(path: str) -> dict[str, Any]:
    with open(path, "rb") as handle:
        data = handle.read()
    magic, version, length = struct.unpack("<III", data[:12])
    if magic != GLB_MAGIC or version != GLB_VERSION or length != len(data):
        raise RuntimeError(f"Not a GLB 2.0 file: {path}")
    chunk_length, chunk_type = struct.unpack("<II", data[12:20])
    if chunk_type != CHUNK_JSON:
        raise RuntimeError("First GLB chunk is not JSON")
    return json.loads(data[20 : 20 + chunk_length].decode("utf-8"))


def import_gltf(filepath: str) -> set[str]:
    try:
        gltf = read_glb_json(filepath)
    except (struct.error, ValueError) as error:
        # Blender operators surface any failure as RuntimeError.
        raise RuntimeError(f"Error: glTF import failed: {error}") from error
    for mesh in gltf.get("meshes", []):
        DATA.meshes.new(mesh.get("name", "Mesh"))
    for material in gltf.get("materials", []):
        DATA.materials.new(material.get("name", "Material"))
    for node in gltf.get("nodes", []):
        obj = DATA.objects.new(node.get("name", "Object"))
        for key, value in node.get("extras", {}).items():
            obj[key] = value
    return {"FINISHED"}


def install_fake_bpy() -> None:
    bpy = types.ModuleType("bpy")
    bpy.data = DATA
    bpy.ops = types.SimpleNamespace(import_scene=types.SimpleNamespace(gltf=import_gltf))
    bpy.app = types.SimpleNamespace(version=(4, 2, 0), version_string="4.2.0 (fake)", background=True)
    bpy.context = types.SimpleNamespace(scene=DATA.scene)
    sys.modules["bpy"] = bpy


def main() -> None:
    script, bundle_dir, library_dir = sys.argv[1:4]
    install_fake_bpy()
    sys.argv = ["blender", "--background", "--python", script, "--", bundle_dir, library_dir]
    status = 0
    try:
        runpy.run_path(script, run_name="__main__")
    except SystemExit as stop:
        status = int(stop.code or 0)
    leftovers = {
        "objects": len(DATA.objects),
        "meshes": len(DATA.meshes),
        "materials": len(DATA.materials),
        "collections": len(DATA.collections),
        "scenes": len(DATA.scenes),
        "images": len(DATA.images),
    }
    print("HARNESS " + json.dumps({"status": status, "leftovers": leftovers, "writes": len(DATA.libraries.writes)}))


if __name__ == "__main__":
    main()
