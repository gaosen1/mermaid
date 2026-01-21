# Mermaid 测试用例

## 1. 简单流程图

```mermaid
graph TD
    A[开始] --> B[结束]
```

## 2. 基础流程图（带分支）

```mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
```

## 3. 左右方向流程图

```mermaid
graph LR
    A[用户请求] --> B[服务器]
    B --> C[数据库]
    C --> B
    B --> A
```

## 4. 带样式的流程图

```mermaid
graph TD
    A[开始] --> B[处理数据]
    B --> C{验证}
    C -->|通过| D[保存]
    C -->|失败| E[报错]
    D --> F[结束]
    E --> F

    style A fill:#4CAF50,color:#fff
    style D fill:#2196F3,color:#fff
    style E fill:#f44336,color:#fff
    style F fill:#9C27B0,color:#fff
```

## 5. 子图（Subgraph）

```mermaid
graph TB
    subgraph 前端
        A[React] --> B[组件]
        B --> C[状态管理]
    end

    subgraph 后端
        D[API] --> E[业务逻辑]
        E --> F[数据库]
    end

    C --> D
```

## 6. 时序图（Sequence Diagram）

```mermaid
sequenceDiagram
    participant U as 用户
    participant C as 客户端
    participant S as 服务器
    participant D as 数据库

    U->>C: 点击登录
    C->>S: POST /login
    S->>D: 查询用户
    D-->>S: 返回用户数据
    S-->>C: 返回 Token
    C-->>U: 显示首页
```

## 7. 复杂时序图（带循环和条件）

```mermaid
sequenceDiagram
    participant 浏览器
    participant 服务器
    participant 缓存
    participant 数据库

    浏览器->>服务器: 请求数据

    alt 缓存命中
        服务器->>缓存: 查询缓存
        缓存-->>服务器: 返回数据
    else 缓存未命中
        服务器->>数据库: 查询数据库
        数据库-->>服务器: 返回数据
        服务器->>缓存: 更新缓存
    end

    服务器-->>浏览器: 响应数据

    loop 每5秒
        浏览器->>服务器: 心跳检测
        服务器-->>浏览器: 确认
    end
```

## 8. 类图（Class Diagram）

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }

    class Dog {
        +String breed
        +bark()
        +fetch()
    }

    class Cat {
        +String color
        +meow()
        +scratch()
    }

    Animal <|-- Dog
    Animal <|-- Cat
```

## 9. 状态图（State Diagram）

```mermaid
stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中: 开始处理
    处理中 --> 已完成: 处理成功
    处理中 --> 失败: 处理失败
    失败 --> 处理中: 重试
    已完成 --> [*]
    失败 --> [*]: 放弃
```

## 10. 实体关系图（ER Diagram）

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        int id PK
        string name
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        int id PK
        int user_id FK
        date created_at
        string status
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    PRODUCT {
        int id PK
        string name
        decimal price
    }
```

## 11. 甘特图（Gantt Chart）

```mermaid
gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD

    section 需求分析
    需求调研           :a1, 2024-01-01, 7d
    需求文档           :a2, after a1, 5d

    section 设计阶段
    UI设计             :b1, after a2, 10d
    架构设计           :b2, after a2, 7d

    section 开发阶段
    前端开发           :c1, after b1, 20d
    后端开发           :c2, after b2, 25d

    section 测试阶段
    单元测试           :d1, after c1, 5d
    集成测试           :d2, after c2, 7d

    section 部署
    上线准备           :e1, after d2, 3d
    正式上线           :milestone, after e1, 0d
```

## 12. 饼图（Pie Chart）

```mermaid
pie showData
    title 技术栈使用占比
    "React" : 35
    "Vue" : 30
    "Angular" : 15
    "Svelte" : 10
    "其他" : 10
```

## 13. 思维导图（Mindmap）

```mermaid
mindmap
  root((前端技术))
    框架
      React
        Hooks
        Redux
      Vue
        Composition API
        Pinia
      Angular
    构建工具
      Vite
      Webpack
      Rollup
    语言
      TypeScript
      JavaScript
      CSS
        Tailwind
        SASS
    测试
      Jest
      Vitest
      Cypress
```

## 14. 用户旅程图（User Journey）

```mermaid
journey
    title 用户购物体验
    section 浏览商品
      打开网站: 5: 用户
      搜索商品: 4: 用户
      查看详情: 4: 用户
    section 下单支付
      加入购物车: 5: 用户
      填写地址: 3: 用户
      选择支付: 4: 用户
      完成支付: 5: 用户
    section 收货评价
      等待发货: 3: 用户
      确认收货: 5: 用户
      撰写评价: 4: 用户
```

## 15. Git 图（Git Graph）

```mermaid
gitGraph
    commit id: "初始化项目"
    commit id: "添加基础配置"
    branch develop
    checkout develop
    commit id: "开发功能A"
    commit id: "开发功能B"
    branch feature/login
    checkout feature/login
    commit id: "登录页面"
    commit id: "登录逻辑"
    checkout develop
    merge feature/login id: "合并登录功能"
    checkout main
    merge develop id: "发布v1.0"
    commit id: "hotfix" type: REVERSE
```

## 16. 复杂流程图（ELK 布局推荐）

```mermaid
---
config:
  layout: elk
---
graph TB
    subgraph 客户端
        A[Web App] --> B[Mobile App]
        A --> C[Desktop App]
    end

    subgraph API网关
        D[负载均衡] --> E[认证服务]
        E --> F[路由服务]
    end

    subgraph 微服务
        G[用户服务]
        H[订单服务]
        I[商品服务]
        J[支付服务]
    end

    subgraph 数据层
        K[(MySQL)]
        L[(Redis)]
        M[(MongoDB)]
        N[(Elasticsearch)]
    end

    subgraph 消息队列
        O[Kafka]
        P[RabbitMQ]
    end

    A --> D
    B --> D
    C --> D

    F --> G
    F --> H
    F --> I
    F --> J

    G --> K
    G --> L
    H --> K
    H --> O
    I --> M
    I --> N
    J --> K
    J --> P

    O --> H
    P --> J
```

## 17. 带自定义扩展语法测试（动画）

```mermaid
graph TD
    A@{ animation: slow }[数据流入] --> B[处理中心]
    B --> C@{ animation: pulse }[输出结果]
    B --> D@{ animation: blink }[错误处理]
```

## 18. 带自定义扩展语法测试（样式）

```mermaid
graph LR
    A@{ fill:#E8F5E9; color:#1B5E20 }[成功] --> B[下一步]
    C@{ fill:#FFEBEE; color:#B71C1C }[失败] --> D[重试]
    E@{ fill:#E3F2FD; color:#0D47A1; stroke:#1565C0; stroke-width:2px }[信息] --> F[处理]
```

## 19. 架构图（Architecture - C4 Model）

```mermaid
C4Context
    title 系统上下文图

    Person(user, "用户", "使用系统的最终用户")
    System(system, "电商系统", "提供在线购物服务")
    System_Ext(payment, "支付系统", "第三方支付服务")
    System_Ext(logistics, "物流系统", "第三方物流服务")

    Rel(user, system, "使用")
    Rel(system, payment, "调用支付接口")
    Rel(system, logistics, "调用物流接口")
```

## 20. 象限图（Quadrant Chart）

```mermaid
quadrantChart
    title Tech Selection
    x-axis Low Learning Curve --> High Learning Curve
    y-axis Simple --> Powerful
    quadrant-1 Careful
    quadrant-2 Recommended
    quadrant-3 Quick Start
    quadrant-4 Optional
    React: [0.7, 0.8]
    Vue: [0.4, 0.7]
    Angular: [0.8, 0.9]
    Svelte: [0.3, 0.5]
    jQuery: [0.2, 0.3]
```

## 21. 超级复杂流程图（多层级子图嵌套）

```mermaid
graph TB
    subgraph 入口层["🌐 入口层"]
        direction LR
        Start["启动应用"] --> Auth["身份验证"]
        Auth --> Route["路由分发"]
    end

    subgraph 前端层["💻 前端表现层"]
        direction TB

        subgraph UI["UI 组件库"]
            direction LR
            UI1["Button 组件"]
            UI2["Form 组件"]
            UI3["Modal 组件"]
            UI4["Table 组件"]
            UI1 --> UI2
            UI2 --> UI3
            UI3 --> UI4
        end

        subgraph 状态管理["📦 状态管理"]
            direction LR
            Store["Redux Store"]
            Middleware["Middleware"]
            Reducer["Reducers"]
            Store --> Middleware --> Reducer
        end

        subgraph 页面模块["📄 页面模块"]
            direction TB
            Home["首页"]
            Dashboard["仪表板"]
            Settings["设置"]
            Profile["个人中心"]
            Home --> Dashboard
            Dashboard --> Settings
            Settings --> Profile
        end

        UI --> 状态管理
        状态管理 --> 页面模块
    end

    subgraph 业务层["⚙️ 业务逻辑层"]
        direction TB

        subgraph 用户模块["👥 用户管理"]
            direction LR
            UAuth["认证"]
            UPerm["权限"]
            UInfo["信息"]
            UAuth --> UPerm --> UInfo
        end

        subgraph 数据处理["🔄 数据处理"]
            direction LR
            Valid["验证"]
            Trans["转换"]
            Cache["缓存"]
            Valid --> Trans --> Cache
        end

        subgraph 业务规则["📋 业务规则"]
            direction LR
            Calc["计算"]
            Judge["判断"]
            Flow["流程"]
            Calc --> Judge --> Flow
        end

        用户模块 --> 数据处理
        数据处理 --> 业务规则
    end

    subgraph API层["🔗 API 与通讯层"]
        direction TB

        subgraph HTTP服务["HTTP 服务"]
            direction LR
            GET["GET 请求"]
            POST["POST 请求"]
            PUT["PUT 请求"]
            DELETE["DELETE 请求"]
            GET --> POST --> PUT --> DELETE
        end

        subgraph WebSocket["⚡ WebSocket"]
            direction LR
            Connect["连接"]
            Message["消息"]
            Close["关闭"]
            Connect --> Message --> Close
        end

        subgraph 拦截器["🛡️ 拦截器"]
            direction LR
            ReqInt["请求拦截"]
            ResInt["响应拦截"]
            ErrInt["错误拦截"]
            ReqInt --> ResInt --> ErrInt
        end

        HTTP服务 --> WebSocket
        WebSocket --> 拦截器
    end

    subgraph 后端服务["🖥️ 后端服务层"]
        direction TB

        subgraph 控制层["🎮 控制层"]
            direction LR
            User_Ctrl["用户控制器"]
            Order_Ctrl["订单控制器"]
            Prod_Ctrl["产品控制器"]
            User_Ctrl --> Order_Ctrl --> Prod_Ctrl
        end

        subgraph 业务服务["💼 业务服务"]
            direction LR
            User_Srv["用户服务"]
            Order_Srv["订单服务"]
            Prod_Srv["产品服务"]
            Pay_Srv["支付服务"]
            User_Srv --> Order_Srv
            Order_Srv --> Prod_Srv
            Prod_Srv --> Pay_Srv
        end

        subgraph 数据访问["💾 数据访问层"]
            direction LR
            User_Repo["用户仓储"]
            Order_Repo["订单仓储"]
            Prod_Repo["产品仓储"]
            Cache_Repo["缓存仓储"]
            User_Repo --> Order_Repo
            Order_Repo --> Prod_Repo
            Prod_Repo --> Cache_Repo
        end

        控制层 --> 业务服务
        业务服务 --> 数据访问
    end

    subgraph 数据层["🗄️ 数据存储层"]
        direction TB

        subgraph 关系型DB["🔵 关系型数据库"]
            direction LR
            MySQL["MySQL"]
            PostgreSQL["PostgreSQL"]
            MySQL --> PostgreSQL
        end

        subgraph NoSQL_DB["🟢 NoSQL 数据库"]
            direction LR
            Mongo["MongoDB"]
            CouchDB["CouchDB"]
            Mongo --> CouchDB
        end

        subgraph 缓存层["⚡ 缓存层"]
            direction LR
            Redis["Redis"]
            Memcached["Memcached"]
            Redis --> Memcached
        end

        subgraph 搜索["🔍 搜索引擎"]
            direction LR
            ES["Elasticsearch"]
            Solr["Solr"]
            ES --> Solr
        end

        关系型DB --> NoSQL_DB
        NoSQL_DB --> 缓存层
        缓存层 --> 搜索
    end

    subgraph 基础设施["🏗️ 基础设施与运维"]
        direction TB

        subgraph 消息队列["📬 消息队列"]
            direction LR
            Kafka["Kafka"]
            RabbitMQ["RabbitMQ"]
            Kafka --> RabbitMQ
        end

        subgraph 监控日志["📊 监控与日志"]
            direction LR
            Prometheus["Prometheus"]
            ELK["ELK Stack"]
            Jaeger["Jaeger"]
            Prometheus --> ELK --> Jaeger
        end

        subgraph CI_CD["🚀 CI/CD"]
            direction LR
            Git["Git Hook"]
            Build["Build"]
            Test["Test"]
            Deploy["Deploy"]
            Git --> Build --> Test --> Deploy
        end

        消息队列 --> 监控日志
        监控日志 --> CI_CD
    end

    Route --> 前端层
    前端层 --> 业务层
    业务层 --> API层
    API层 --> 后端服务
    后端服务 --> 数据层
    数据层 --> 基础设施

    classDef entryStyle fill:#FFE082,color:#333,stroke:#FBC02D,stroke-width:3px
    classDef frontStyle fill:#90CAF9,color:#fff,stroke:#1976D2,stroke-width:2px
    classDef businessStyle fill:#A5D6A7,color:#fff,stroke:#388E3C,stroke-width:2px
    classDef apiStyle fill:#CE93D8,color:#fff,stroke:#7B1FA2,stroke-width:2px
    classDef backStyle fill:#FFB74D,color:#fff,stroke:#E65100,stroke-width:2px
    classDef dataStyle fill:#EF9A9A,color:#fff,stroke:#C62828,stroke-width:2px
    classDef infraStyle fill:#80DEEA,color:#fff,stroke:#00838F,stroke-width:2px

    class 入口层 entryStyle
    class 前端层,UI,状态管理,页面模块 frontStyle
    class 业务层,用户模块,数据处理,业务规则 businessStyle
    class API层,HTTP服务,WebSocket,拦截器 apiStyle
    class 后端服务,控制层,业务服务,数据访问 backStyle
    class 数据层,关系型DB,NoSQL_DB,缓存层,搜索 dataStyle
    class 基础设施,消息队列,监控日志,CI_CD infraStyle
```
