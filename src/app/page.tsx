import { fixtureProject } from '@/core/fixtures'
import { runPipeline } from '@/pipeline'

// Placeholder shell — the UI work stream replaces this with the designer.
export default function Home() {
  const { build } = runPipeline(fixtureProject())
  return (
    <main style={{ padding: 24 }}>
      <h1>CabinetMaker</h1>
      <p>{build.parts.length} parts</p>
    </main>
  )
}
