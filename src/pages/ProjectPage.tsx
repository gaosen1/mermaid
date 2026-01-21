import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useDiagramStore } from '@/stores/diagramStore'
import { DiagramList } from '@/components/diagram/DiagramList'
import { DiagramEditor } from '@/components/mermaid/DiagramEditor'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft } from 'lucide-react'
import type { Diagram } from '@/types'

interface ProjectPageProps {
  projectId: string
  onBack: () => void
}

export function ProjectPage({ projectId, onBack }: ProjectPageProps) {
  const { projects, currentProject, setCurrentProject } = useProjectStore()
  const { loadDiagramsByProject, currentDiagram, setCurrentDiagram } = useDiagramStore()

  useEffect(() => {
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setCurrentProject(project)
      loadDiagramsByProject(projectId)
    }
  }, [projectId, projects, setCurrentProject, loadDiagramsByProject])

  useEffect(() => {
    return () => {
      setCurrentDiagram(null)
    }
  }, [setCurrentDiagram])

  const handleSelectDiagram = (diagram: Diagram) => {
    setCurrentDiagram(diagram)
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">项目不存在</div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-64 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h2 className="font-semibold truncate">{currentProject.name}</h2>
          {currentProject.description && (
            <p className="text-sm text-muted-foreground truncate">
              {currentProject.description}
            </p>
          )}
        </div>
        <DiagramList
          projectId={projectId}
          onSelectDiagram={handleSelectDiagram}
        />
      </div>
      <Separator orientation="vertical" />
      <div className="flex-1 overflow-hidden h-full">
        {currentDiagram ? (
          <DiagramEditor diagramId={currentDiagram.id} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            选择或创建一个图表开始编辑
          </div>
        )}
      </div>
    </div>
  )
}
