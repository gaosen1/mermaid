import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectList } from '@/components/project/ProjectList'
import type { Project } from '@/types'

interface HomePageProps {
  onSelectProject: (project: Project) => void
  onSelectDiagramResult?: (projectId: string, diagramId: string) => void
}

export function HomePage({ onSelectProject, onSelectDiagramResult }: HomePageProps) {
  const { loadProjects } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="h-full">
      <ProjectList onSelectProject={onSelectProject} onSelectDiagramResult={onSelectDiagramResult} />
    </div>
  )
}
