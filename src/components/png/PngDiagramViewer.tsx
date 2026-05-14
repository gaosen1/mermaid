import { useCallback } from 'react'
import { Download, ImageIcon, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDiagramStore } from '@/stores/diagramStore'
import { exportDiagram } from '@/utils/export'
import { isPngSource } from '@/utils/png'
import { useZoomPan } from '@/hooks/useZoomPan'

interface PngDiagramViewerProps {
  diagramId: string
}

export function PngDiagramViewer({ diagramId }: PngDiagramViewerProps) {
  const { currentDiagram } = useDiagramStore()
  const { scale, position, isDragging, wrapperRef, handleMouseDown, handleMouseMove, handleMouseUp, resetView, fitView } =
    useZoomPan()

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget
      fitView(img.naturalWidth, img.naturalHeight)
    },
    [fitView]
  )

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
      <div className="png-diagram-viewer-toolbar absolute right-4 top-4 z-10 flex items-center gap-2">
        {hasImage && (
          <>
            <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-1.5 py-0.5 select-none">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 png-diagram-viewer-reset bg-background/90 backdrop-blur"
              onClick={resetView}
              title="重置视图"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
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

      {/* 视口 —— 始终渲染，wrapperRef（callback ref）挂在这里 */}
      <div
        ref={wrapperRef}
        className="png-diagram-viewer-canvas absolute inset-0"
        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {hasImage ? (
          <div
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            <img
              src={currentDiagram.source}
              alt={currentDiagram.name}
              className="png-diagram-viewer-image rounded-lg bg-white shadow-xl block"
              style={{ maxWidth: 'none' }}
              draggable={false}
              onLoad={handleImageLoad}
            />
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
    </div>
  )
}
