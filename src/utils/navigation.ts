/**
 * 全局导航工具：AppLayout 监听 popstate 解析路径路由，
 * 因此 pushState + 派发 popstate 即可从任意组件跳转。
 */

export function navigateToSettings(): void {
  if (window.location.pathname !== '/settings') {
    window.history.pushState(null, '', '/settings')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
