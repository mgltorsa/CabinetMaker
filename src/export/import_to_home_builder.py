"""Turn a CabinetMaker Blender bundle into an asset library for Home Builder 5.

Command line (Blender 4.x):

    blender --background --python import_to_home_builder.py -- <bundle dir> <library dir>

Scripting tab: open this file in Blender's Text Editor, set BUNDLE_DIR and
LIBRARY_DIR below, then press Run Script.

For every cabinet listed in manifest.json the script imports
cabinets/<slug>.glb, gathers the imported objects into a collection named
after the cabinet, copies the cabinet metadata into the collection's custom
properties, marks the collection as an asset (preview from cabinets/<slug>.png
when present), writes <library dir>/<slug>.blend holding only that cabinet,
and copies the PNG next to it as <slug>.png (the same-name thumbnail
convention Home Builder libraries use). The file open in Blender is left as
it was: imported data is removed again after each cabinet is written.

Written against the Blender 4.x Python API. CabinetMaker's tests check the
syntax and run the script against a stand-in for bpy; it has not been run
inside Blender by CabinetMaker's test suite. See README.txt.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from dataclasses import dataclass
from typing import Any

import bpy

# Edit these two paths when running from the Scripting tab.
# Empty BUNDLE_DIR: the folder this script is in (or the current folder).
BUNDLE_DIR = ""
# Empty LIBRARY_DIR: a "library" folder inside the bundle folder.
LIBRARY_DIR = ""

MANIFEST_NAME = "manifest.json"
MANIFEST_FORMAT = "cabinetmaker-blender-bundle"
SUPPORTED_MANIFEST_VERSION = 1
DEFAULT_LIBRARY_SUBDIR = "library"
PREVIEW_SIZE = 256
RGBA_CHANNELS = 4
ASSET_TAG = "CabinetMaker"
MIN_BLENDER_VERSION = (4, 0, 0)
PROPERTY_TYPES = (str, int, float, bool)
EXIT_OK = 0
EXIT_SOME_FAILED = 1
EXIT_NO_BUNDLE = 2


class BundleError(Exception):
    """The bundle folder, its manifest or one of its files cannot be used."""


@dataclass(frozen=True)
class Imported:
    """Data blocks created by one glTF import, so they can be removed again."""

    objects: list[Any]
    meshes: list[Any]
    materials: list[Any]
    collections: list[Any]


def script_dir() -> str:
    """Folder of this script file, or the current folder when it has none."""
    path = globals().get("__file__") or ""
    if path and os.path.isfile(path):
        return os.path.dirname(os.path.abspath(path))
    return os.getcwd()


def parse_args(argv: list[str]) -> tuple[str, str]:
    """Return (bundle_dir, library_dir) from the arguments after "--", else the constants."""
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    bundle_dir = args[0] if args else (BUNDLE_DIR or script_dir())
    library_dir = args[1] if len(args) > 1 else (LIBRARY_DIR or os.path.join(bundle_dir, DEFAULT_LIBRARY_SUBDIR))
    return os.path.abspath(bundle_dir), os.path.abspath(library_dir)


def load_manifest(bundle_dir: str) -> dict[str, Any]:
    """Read and check manifest.json from the bundle folder."""
    path = os.path.join(bundle_dir, MANIFEST_NAME)
    if not os.path.isfile(path):
        raise BundleError(f"{MANIFEST_NAME} not found in {bundle_dir} (set BUNDLE_DIR or pass the bundle folder)")
    with open(path, encoding="utf-8") as handle:
        manifest = json.load(handle)
    if not isinstance(manifest, dict) or manifest.get("format") != MANIFEST_FORMAT:
        raise BundleError(f"{path} is not a CabinetMaker Blender bundle manifest")
    if manifest.get("version") != SUPPORTED_MANIFEST_VERSION:
        raise BundleError(f"Unsupported manifest version {manifest.get('version')!r}")
    if not isinstance(manifest.get("cabinets"), list):
        raise BundleError("The manifest lists no cabinets")
    return manifest


def safe_slug(slug: object) -> str:
    """A manifest slug used as a file name: a plain name, never a path."""
    if not isinstance(slug, str) or not slug or os.path.basename(slug) != slug or slug in (".", ".."):
        raise BundleError(f"Unsafe file name in manifest: {slug!r}")
    return slug


def bundle_file(bundle_dir: str, relative: object) -> str:
    """Absolute path of a file the manifest names; it must stay inside the bundle."""
    if not isinstance(relative, str) or not relative:
        raise BundleError(f"Bad file path in manifest: {relative!r}")
    root = os.path.realpath(bundle_dir)
    path = os.path.realpath(os.path.join(root, relative))
    if os.path.commonpath([root, path]) != root:
        raise BundleError(f"File path leaves the bundle folder: {relative!r}")
    return path


def import_glb(path: str) -> Imported:
    """Import one GLB into the current file and return what it created."""
    if not os.path.isfile(path):
        raise BundleError(f"Missing model file {path}")
    before = {
        "objects": set(bpy.data.objects),
        "meshes": set(bpy.data.meshes),
        "materials": set(bpy.data.materials),
        "collections": set(bpy.data.collections),
    }
    failure = ""
    try:
        result = bpy.ops.import_scene.gltf(filepath=path)
    except RuntimeError as error:  # operators report errors by raising
        result, failure = set(), str(error)

    def created(kind: str) -> list[Any]:
        return [block for block in getattr(bpy.data, kind) if block not in before[kind]]

    imported = Imported(
        objects=created("objects"),
        meshes=created("meshes"),
        materials=created("materials"),
        collections=created("collections"),
    )
    if "FINISHED" not in result:
        remove_imported(imported, None)
        raise BundleError(f"glTF import failed for {path}: {failure or sorted(result)}")
    return imported


def build_collection(name: str, objects: list[Any], properties: dict[str, Any]) -> Any:
    """Move the objects into a new collection that carries the cabinet metadata."""
    collection = bpy.data.collections.new(name)
    for obj in objects:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
    for key, value in properties.items():
        if isinstance(value, PROPERTY_TYPES):
            collection[key] = value
    return collection


def set_preview_from_png(id_block: Any, png_path: str) -> None:
    """Use the PNG as the asset preview, scaled to the preview size."""
    image = bpy.data.images.load(png_path, check_existing=False)
    try:
        image.scale(PREVIEW_SIZE, PREVIEW_SIZE)
        pixels = list(image.pixels[:])
        preview = id_block.preview_ensure()
        preview.image_size = (PREVIEW_SIZE, PREVIEW_SIZE)
        preview.image_pixels_float[:] = pixels[: PREVIEW_SIZE * PREVIEW_SIZE * RGBA_CHANNELS]
    finally:
        bpy.data.images.remove(image)


def mark_asset(collection: Any, entry: dict[str, Any], png_path: str | None) -> str:
    """Mark the collection as an asset with tags, a description and a preview."""
    collection.asset_mark()
    data = collection.asset_data
    data.description = f"{entry.get('name', '')} - {entry.get('type', '')} cabinet from CabinetMaker"
    for tag in (ASSET_TAG, str(entry.get("type", ""))):
        if tag:
            data.tags.new(tag, skip_if_exists=True)
    if png_path:
        try:
            set_preview_from_png(collection, png_path)
            return "png"
        except (RuntimeError, OSError) as error:
            print(f"  preview from {os.path.basename(png_path)} failed ({error}); generating one")
    # Rendering a preview needs a GPU context; under --background it may stay empty.
    collection.asset_generate_preview()
    return "generated"


def write_library_file(path: str, collection: Any) -> None:
    """Write a .blend holding one scene with the cabinet collection (and its objects)."""
    scene = bpy.data.scenes.new(collection.name)
    try:
        scene.collection.children.link(collection)
        bpy.data.libraries.write(path, {scene, collection}, path_remap="NONE", compress=True)
    finally:
        bpy.data.scenes.remove(scene)


def remove_imported(imported: Imported, collection: Any | None) -> None:
    """Remove one cabinet's data again so the next cabinet starts clean."""
    for obj in imported.objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in [*imported.collections, *([collection] if collection is not None else [])]:
        bpy.data.collections.remove(block)
    for mesh in imported.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in imported.materials:
        if material.users == 0:
            bpy.data.materials.remove(material)


def process_cabinet(entry: object, bundle_dir: str, library_dir: str) -> str:
    """Import one cabinet and write its library .blend (+ .png). Returns a summary line."""
    if not isinstance(entry, dict):
        raise BundleError("Cabinet entry is not an object")
    slug = safe_slug(entry.get("slug"))
    name = str(entry.get("name") or slug)
    glb_path = bundle_file(bundle_dir, entry.get("glb"))
    thumbnail = entry.get("thumbnail")
    png_path = bundle_file(bundle_dir, thumbnail) if thumbnail else None
    if png_path and not os.path.isfile(png_path):
        png_path = None
    extras = entry.get("extras")

    imported = import_glb(glb_path)
    collection = None
    try:
        if not imported.objects:
            raise BundleError(f"No objects were imported from {glb_path}")
        collection = build_collection(name, imported.objects, extras if isinstance(extras, dict) else {})
        preview = mark_asset(collection, entry, png_path)
        write_library_file(os.path.join(library_dir, f"{slug}.blend"), collection)
    finally:
        remove_imported(imported, collection)
    if png_path:
        shutil.copyfile(png_path, os.path.join(library_dir, f"{slug}.png"))
    return f"{slug}.blend  ({name}, {len(imported.objects)} objects, preview: {preview})"


def print_summary(library_dir: str, written: list[str], failed: list[tuple[str, str]]) -> None:
    """Print what was written and what failed (Blender shows stdout in its console)."""
    total = len(written) + len(failed)
    print(f"CabinetMaker -> Home Builder: {len(written)} of {total} cabinets written to {library_dir}")
    for line in written:
        print(f"  ok      {line}")
    for name, reason in failed:
        print(f"  FAILED  {name}: {reason}")


def main(argv: list[str]) -> int:
    """Run the import. Returns a process exit status (0 = every cabinet written)."""
    if tuple(bpy.app.version) < MIN_BLENDER_VERSION:
        print(f"Warning: written for Blender 4.x, running on {bpy.app.version_string}")
    bundle_dir, library_dir = parse_args(argv)
    try:
        manifest = load_manifest(bundle_dir)
    except (BundleError, OSError, ValueError) as error:
        print(f"CabinetMaker -> Home Builder: {error}")
        return EXIT_NO_BUNDLE
    os.makedirs(library_dir, exist_ok=True)
    written: list[str] = []
    failed: list[tuple[str, str]] = []
    for entry in manifest["cabinets"]:
        label = str(entry.get("name", "?")) if isinstance(entry, dict) else "?"
        try:
            written.append(process_cabinet(entry, bundle_dir, library_dir))
        except (BundleError, RuntimeError, OSError, ValueError, TypeError) as error:
            failed.append((label, str(error)))
    print_summary(library_dir, written, failed)
    return EXIT_OK if not failed else EXIT_SOME_FAILED


if __name__ == "__main__":
    STATUS = main(sys.argv)
    # Exit only from the command line: sys.exit inside the UI would close Blender.
    if bpy.app.background:
        sys.exit(STATUS)
