import type { GraphModel, EditorAPI, DiagramConfig } from '@/types'
import { useDiagramStore } from '@/stores/diagramStore'

export function createEditorAPI(): EditorAPI {
  return {
    loadGraph(graph: GraphModel): void {
      const { setCurrentDiagram } = useDiagramStore.getState()
      setCurrentDiagram({
        id: graph.id,
        projectId: '',
        name: graph.name,
        source: graph.source,
        createdAt: graph.lastModified,
        updatedAt: graph.lastModified,
        config: graph.metadata as DiagramConfig | undefined,
      })
    },

    async saveGraph(partial: Pick<GraphModel, 'id' | 'source'>): Promise<void> {
      const { updateDiagram } = useDiagramStore.getState()
      await updateDiagram(partial.id, { source: partial.source })
    },
  }
}

declare global {
  interface Window {
    MermaidEditorAPI?: EditorAPI
  }
}

export function exposeEditorAPI(): void {
  if (typeof window !== 'undefined') {
    window.MermaidEditorAPI = createEditorAPI()
  }
}
