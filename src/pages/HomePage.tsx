import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectList } from '@/components/project/ProjectList'
import type { Project } from '@/types'

interface HomePageProps {
  onSelectProject: (project: Project) => void
}

export function HomePage({ onSelectProject }: HomePageProps) {
  const { loadProjects } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="h-full">
      <ProjectList onSelectProject={onSelectProject} />
    </div>
  )
}
