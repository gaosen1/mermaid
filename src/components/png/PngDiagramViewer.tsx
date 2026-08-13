import { useCallback } from 'react'
import { Download, ImageIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDiagramStore } from '@/stores/diagramStore'
import { useFolderStore } from '@/stores/folderStore'
import { exportDiagram } from '@/utils/export'
import { isImageSource, isImageType } from '@/utils/png'
import { getDiagramTypeLabel, getDiagramFilename } from '@/utils/diagram'
import { getFolderPath } from '@/utils/folder'
import { useZoomPan } from '@/hooks/useZoomPan'

interface PngDiagramViewerProps {
  diagramId: string
  sidebarWidth?: number
  sidebarAnimating?: boolean
}

export function PngDiagramViewer({ diagramId, sidebarWidth = 0, sidebarAnimating = false }: PngDiagramViewerProps) {
  const { currentDiagram } = useDiagramStore()
  const { folders } = useFolderStore()
  const { scale, position, isDragging, wrapperRef, handleMouseDown, handleMouseMove, handleMouseUp, resetView, fitView, zoomBy } =
    useZoomPan(diagramId)

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget
      fitView(img.naturalWidth, img.naturalHeight)
    },
    [fitView]
  )

  if (!currentDiagram || currentDiagram.id !== diagramId || !isImageType(currentDiagram.type)) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        请选择一个图片图表
      </div>
    )
  }

  const hasImage = isImageSource(currentDiagram.source)
  const typeLabel = getDiagramTypeLabel(currentDiagram.type)
  const relativePath = [...getFolderPath(currentDiagram.folderId, folders), getDiagramFilename(currentDiagram)].join(' / ')

  return (
    <div className="image-diagram-viewer relative h-full w-full overflow-hidden bg-muted/30">
      <div
        className={`diagram-editor-path absolute top-4 z-10 max-w-[60%] truncate rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground backdrop-blur select-none ${
          sidebarAnimating ? 'transition-[left] duration-300 ease-out' : ''
        }`}
        style={{ left: sidebarWidth + 16 }}
        title={relativePath}
      >
        {relativePath}
      </div>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {hasImage && (
          <>
            <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-1.5 py-0.5 select-none">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-background/90 backdrop-blur"
              onClick={() => zoomBy(1 / 1.2)}
              title="缩小"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-background/90 backdrop-blur"
              onClick={() => zoomBy(1.2)}
              title="放大"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-background/90 backdrop-blur"
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
          className="bg-background/90 backdrop-blur"
          onClick={() => exportDiagram(currentDiagram)}
          disabled={!hasImage}
        >
          <Download className="mr-2 h-4 w-4" />
          导出 {typeLabel}
        </Button>
      </div>

      {/* 视口 —— 始终渲染，callback ref 挂在这里 */}
      <div
        ref={wrapperRef}
        className="absolute inset-0"
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
              className="rounded-lg bg-white shadow-xl block"
              style={{ maxWidth: 'none' }}
              draggable={false}
              onLoad={handleImageLoad}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
            <p className="text-sm">
              请直接粘贴 {typeLabel} 图片，或通过导入按钮选择文件
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
