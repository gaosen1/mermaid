import { Download, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDiagramStore } from '@/stores/diagramStore'
import { exportDiagram } from '@/utils/export'
import { isPngSource } from '@/utils/png'

interface PngDiagramViewerProps {
  diagramId: string
}

export function PngDiagramViewer({ diagramId }: PngDiagramViewerProps) {
  const { currentDiagram } = useDiagramStore()

  if (!currentDiagram || currentDiagram.id !== diagramId || currentDiagram.type !== 'png') {
    return (
      <div className="png-diagram-viewer-empty flex h-full items-center justify-center text-muted-foreground">
        请选择一个 PNG 图表
      </div>
    )
  }

  const hasImage = isPngSource(currentDiagram.source)

  return (
    <div className="png-diagram-viewer relative h-full w-full overflow-hidden bg-muted/30">
      <div className="png-diagram-viewer-toolbar absolute right-4 top-4 z-10">
        <Button
          variant="outline"
          size="sm"
          className="png-diagram-viewer-export bg-background/90 backdrop-blur"
          onClick={() => exportDiagram(currentDiagram)}
          disabled={!hasImage}
        >
          <Download className="mr-2 h-4 w-4" />
          导出 PNG
        </Button>
      </div>

      {hasImage ? (
        <div className="png-diagram-viewer-canvas absolute inset-0 overflow-auto p-8">
          <div className="png-diagram-viewer-image-wrap flex min-h-full items-center justify-center">
            <img
              src={currentDiagram.source}
              alt={currentDiagram.name}
              className="png-diagram-viewer-image max-h-full max-w-full rounded-lg bg-white shadow-xl"
            />
          </div>
        </div>
      ) : (
        <div className="png-diagram-viewer-placeholder flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <ImageIcon className="png-diagram-viewer-placeholder-icon h-10 w-10" />
          <p className="png-diagram-viewer-placeholder-text text-sm">
            请直接粘贴 PNG 图片，或通过导入按钮选择 .png 文件
          </p>
        </div>
      )}
    </div>
  )
}
