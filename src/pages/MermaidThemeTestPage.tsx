import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import * as Popover from '@radix-ui/react-popover'

export function MermaidThemeTestPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [anchorPopoverOpen, setAnchorPopoverOpen] = useState(false)
  const [anchorPosition] = useState({ x: 400, y: 300 })
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.style.left = `${anchorPosition.x}px`
      anchorRef.current.style.top = `${anchorPosition.y}px`
    }
  }, [anchorPosition])

  useEffect(() => {
    if (!containerRef.current) return

    let isMounted = true

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: {
        curve: 'linear',
        nodeSpacing: 30,
        rankSpacing: 50,
        wrappingWidth: 200,
      },
    })

    const testDiagrams = [
      {
        title: 'Flowchart 测试',
        code: `flowchart TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作1]
    B -->|否| D[执行操作2]
    C --> E[结束]
    D --> E`,
      },
      {
        title: 'Flowchart with Subgraph 测试',
        code: `flowchart TB
    A[用户请求] --> B{验证身份}
    B -->|成功| C[进入系统]
    B -->|失败| D[拒绝访问]
    
    C --> E[选择功能]
    
    subgraph 数据处理模块
        E --> F[读取数据]
        F --> G[处理数据]
        G --> H[保存结果]
    end
    
    subgraph 通知模块
        H --> I[发送通知]
        I --> J[记录日志]
    end
    
    J --> K[返回结果]
    D --> L[记录失败]`,
      },
      {
        title: 'Sequence Diagram 测试',
        code: `sequenceDiagram
    participant A as 用户
    participant B as 系统
    participant C as 数据库
    A->>B: 发送请求
    B->>C: 查询数据
    C-->>B: 返回结果
    B-->>A: 响应数据`,
      },
      {
        title: 'Class Diagram 测试',
        code: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
      },
      {
        title: 'State Diagram 测试',
        code: `stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中: 开始处理
    处理中 --> 已完成: 完成
    处理中 --> 失败: 出错
    失败 --> 待处理: 重试
    已完成 --> [*]`,
      },
      {
        title: 'ER Diagram 测试',
        code: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    USER {
        string id
        string name
        string email
    }
    ORDER {
        string id
        date created_at
        string status
    }`,
      },
      {
        title: 'Gantt Chart 测试',
        code: `gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 设计阶段
    需求分析           :a1, 2024-01-01, 7d
    UI设计            :a2, after a1, 5d
    section 开发阶段
    前端开发           :b1, after a2, 10d
    后端开发           :b2, after a2, 12d
    section 测试阶段
    集成测试           :c1, after b1 b2, 5d`,
      },
    ]

    const renderDiagrams = async () => {
      if (!containerRef.current || !isMounted) return

      const isDarkMode = document.documentElement.classList.contains('dark')

      containerRef.current.innerHTML = ''

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: isDarkMode ? 'dark' : 'base',
        flowchart: {
          curve: 'linear',
          nodeSpacing: 30,
          rankSpacing: 50,
          wrappingWidth: 200,
        },
      })

      for (let i = 0; i < testDiagrams.length; i++) {
        if (!isMounted) break

        const diagram = testDiagrams[i]
        const wrapper = document.createElement('div')
        wrapper.className = 'mb-8 p-4 border border-border rounded-lg bg-card'

        const title = document.createElement('h3')
        title.className = 'text-lg font-semibold mb-4 text-foreground'
        title.textContent = diagram.title
        wrapper.appendChild(title)

        const diagramDiv = document.createElement('div')
        diagramDiv.className = 'mermaid-container bg-background p-4 rounded overflow-auto'
        diagramDiv.id = `mermaid-test-${i}`

        try {
          const { svg } = await mermaid.render(`diagram-${i}`, diagram.code)
          if (isMounted) {
            diagramDiv.innerHTML = svg
          }
        } catch (error) {
          if (isMounted) {
            diagramDiv.innerHTML = `<pre class="text-destructive">渲染错误: ${error}</pre>`
          }
        }

        if (isMounted && containerRef.current) {
          wrapper.appendChild(diagramDiv)
          containerRef.current.appendChild(wrapper)
        }
      }
    }

    renderDiagrams()

    const observer = new MutationObserver(() => {
      renderDiagrams()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      isMounted = false
      observer.disconnect()
    }
  }, [])

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Mermaid Dark 主题测试</h1>
          <p className="text-muted-foreground">
            所有图表都跟随当前网站主题在 <code className="px-1 py-0.5 bg-muted rounded">base</code> / <code className="px-1 py-0.5 bg-muted rounded">dark</code> 间切换
          </p>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-mono">
              mermaid.initialize({'{'}
              <br />
              &nbsp;&nbsp;theme: document.documentElement.classList.contains('dark') ? 'dark' : 'base',
              <br />
              &nbsp;&nbsp;securityLevel: 'loose',
              <br />
              &nbsp;&nbsp;startOnLoad: false,
              <br />
              {'}'})
            </p>
          </div>

          {/* Popover 测试 */}
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">测试 1: Popover with Trigger</h2>
              <p className="text-sm text-muted-foreground mb-4">
                使用 PopoverTrigger 的标准方式
              </p>
              
              <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
                <Popover.Trigger asChild>
                  <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    点击打开 Popover
                  </button>
                </Popover.Trigger>
                
                <Popover.Portal>
                  <Popover.Content
                    className="w-64 p-4 bg-popover text-popover-foreground border border-border rounded-md shadow-lg
                      data-[state=open]:animate-in data-[state=closed]:animate-out 
                      data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 
                      data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 
                      data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 
                      data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                    sideOffset={8}
                    side="right"
                  >
                    <h3 className="font-semibold mb-2">测试 Popover</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      关闭时观察是否有闪烁
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {['红', '绿', '蓝', '黄', '紫', '橙'].map((color) => (
                        <div
                          key={color}
                          className="h-8 flex items-center justify-center bg-muted rounded text-xs"
                        >
                          {color}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setPopoverOpen(false)}
                      className="mt-3 w-full px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    >
                      关闭
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">测试 2: Popover with Anchor (模拟 EdgeStylePanel)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                使用 PopoverAnchor + fixed 定位的虚拟锚点
              </p>
              
              <button
                onClick={() => setAnchorPopoverOpen(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                点击打开 Anchor Popover
              </button>

              <Popover.Root open={anchorPopoverOpen} onOpenChange={(open) => !open && setAnchorPopoverOpen(false)}>
                <Popover.Anchor asChild>
                  <div
                    ref={anchorRef}
                    className="fixed pointer-events-none"
                    style={{
                      left: anchorPosition.x,
                      top: anchorPosition.y,
                      width: 1,
                      height: 1,
                    }}
                  />
                </Popover.Anchor>

                <Popover.Portal>
                  <Popover.Content
                    className="w-64 p-4 bg-popover text-popover-foreground border border-border rounded-md shadow-lg
                      data-[state=open]:animate-in data-[state=closed]:animate-out 
                      data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 
                      data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 
                      data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 
                      data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                    sideOffset={8}
                    side="right"
                    align="start"
                  >
                    <h3 className="font-semibold mb-2">Anchor Popover</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      这个使用虚拟锚点定位，和 EdgeStylePanel 一样
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {['红', '绿', '蓝', '黄', '紫', '橙'].map((color) => (
                        <div
                          key={color}
                          className="h-8 flex items-center justify-center bg-muted rounded text-xs"
                        >
                          {color}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setAnchorPopoverOpen(false)}
                      className="mt-3 w-full px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    >
                      关闭
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </div>
        </div>

        <div ref={containerRef} />
      </div>
    </div>
  )
}
