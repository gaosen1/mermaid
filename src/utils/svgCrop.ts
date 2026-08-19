/**
 * 将 SVG 的 viewBox 裁剪到内容 bbox，去除布局产生的大片空白。
 * 通过克隆节点挂载测量，不改动原节点在 DOM 中的位置。
 */
export function cropSvgToContentBBox(svgEl: SVGSVGElement, pad = 8): void {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;'
  host.appendChild(clone)
  document.body.appendChild(host)
  try {
    const bbox = clone.getBBox()
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      svgEl.setAttribute(
        'viewBox',
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`
      )
    }
  } catch {
    // 忽略裁剪失败，保留原 viewBox
  } finally {
    host.remove()
  }
}
