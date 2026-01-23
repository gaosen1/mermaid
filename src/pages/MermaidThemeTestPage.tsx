import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

export function MermaidThemeTestPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let isMounted = true

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'dark',
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

      containerRef.current.innerHTML = ''

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

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Mermaid Dark 主题测试</h1>
          <p className="text-muted-foreground">
            所有图表都使用硬编码的 <code className="px-1 py-0.5 bg-muted rounded">theme: 'dark'</code> 配置
          </p>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-mono">
              mermaid.initialize({'{'}
              <br />
              &nbsp;&nbsp;theme: 'dark',
              <br />
              &nbsp;&nbsp;securityLevel: 'loose',
              <br />
              &nbsp;&nbsp;startOnLoad: false,
              <br />
              {'}'})
            </p>
          </div>
        </div>

        <div ref={containerRef} />
      </div>
    </div>
  )
}
