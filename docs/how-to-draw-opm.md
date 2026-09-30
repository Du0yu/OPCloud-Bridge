# How to Draw an OPM Diagram

本指南根据用户提供、标注为 SYSH5000 Week 2–5 的课程学习摘要整理。项目未收到或核实原始课件，因此下列步骤、原则名称和 SD 检查清单属于参考性建模方法，不作为已核实的课程原文或 ISO 强制条款。ISO 依据与实现范围见 [条款对照表](iso-19450-2024-coverage.md)，原生序列化和验证要求见 [AGENTS.md](../AGENTS.md)。

主线：**Purpose → Function → Transformation → Enablers → Environment → Structure → Validation**。先说明为什么需要系统、系统改变什么，再补支持它的结构；边界在开始时暂定，随着建模细化复核。

## 1. 写出目的，再确定主功能

先完成一句话：系统通过 **Main Process**，使 **Benefit-providing Object** 被创建、消耗或改变状态，为 **Beneficiary** 带来 **Benefit**。

记录受益者、价值、承载价值的对象、当前问题或未满足需求。受益者只是场景角色，不能仅因为“获益”就连 Agent，也不能凭一条“价值箭头”编造关系。所有实际入图关系都要说明原生语义。

以主功能为建模起点（Function-as-a-Seed）。顶层 SD 先围绕一个清晰主功能组织；这是本指南的表达建议，不是“所有 OPD 只能有一个 Process”的校验限制。不要先罗列几十个设备，再倒推它们为什么存在。

## 2. 区分 Things 与两个独立维度

Object 表示存在的实体，用名词或名词短语；Process 表示发生并变换对象的过程，优先使用动名词短语。先问每个重要 Process 创建、消耗或改变了哪个 Object。只有使能关系却没有可解释的变换时，应重新审视过程范围和细化层次。

| 维度 | OPCloud 值 | 例子与判断 |
|---|---|---|
| Essence | Physical `0` / Informatical `1` | `Battery` 与 `Reservation`；`Water Heating` 与 `Ticket Ordering` |
| Affiliation | Systemic `0` / Environmental `1` | 根据本模型的系统边界决定，与是否物理存在无关 |

Object 和 Process 都有 essence/affiliation。使用原生字段，让 OPCloud 绘制外观，不用自定义阴影或图形替代。不要仅凭“不是我制造的”就判定 Environmental；说明该实体在所选系统范围中的角色。

## 3. 确定变换，再选过程链接

对每一对参与实体，先问“它被改变了吗”，再问“它是否只是使过程得以发生”。下表是关系选择辅助，不是完整 OPCL 模板。

| 场景事实 | 原生关系与方向 | 预期 OPL 示例 |
|---|---|---|
| 生成新对象 | Result `3`：Process → Object | `Baking yields Cake.` |
| 对象不再以建模的形式存在 | Consumption `2`：Object → Process | `Burning consumes Wood.` |
| 同一对象状态改变，细节暂未展开 | Effect `4`：Object ↔ Process | `Charging affects Battery.` |
| 知道变换前后状态 | 旧 State → Process 用 `2`；Process → 新 State 用 `3` | `Heating changes Water from cold to hot.` |
| 人或人群使过程发生，未在该关系中被变换 | Agent `0`：Object → Process | `Operator handles Coffee Preparing.` |
| 必需且未被变换的非人对象 | Instrument `1`：Object → Process | `Coffee Preparing requires Coffee Machine.` |

参考中的 “Yield Link” 在本项目映射为 **Result**，不是新链接类型。不要把整个 Battery 当作被消耗的 Energy；明确建模身份与抽象层次。软件和机器人不能因其具有自主性就被当作人类 Agent。

## 4. 用状态表达已知的前置条件与结果

State 属于同一个 Object，不能挂在 Process 下。只补与本次分析有关的状态；不要为了形式完整臆造状态。已知 `cold → hot` 时，优先明确前后状态，而不是停留在模糊的 affects。

生成时创建完整原生 `OpmLogicalState`，设置 `fatherObjectId`，在父 Object 的 `children` 中登记，并按上表连 Consumption/Result。不要同时堆叠表达同一事实的冗余 Effect。

本桥接对 Effect 要求完整模型中的原生状态证据；状态可以显示在其他 OPD。结构证据不证明变换语义正确；不透明的 `statesWithoutVisual` 仍需人工审阅。

参考里的 `Coffee Machine [ready] → Coffee Preparing → [ready]` 不能仅因前后都写 ready 就声称状态改变。若只表达就绪前置条件，应使用经验证的原生状态指定 Instrument；若机器确实经历 `ready → brewing → ready`，应按真实行为细化，而不是让它既作为不变的 Instrument 又被同一简化关系变换。

## 5. 补使能对象与环境

列出过程所需且未被该过程变换的人、设备、软件、信息与资源。人是否为 Agent 依据场景判断，不依据名字。受益者、操作者和被变换对象可能是不同实体；例如顾客只是接收成品时，不能自动写成 handles。

确认哪些 Things 在系统内部，哪些属于外部环境，并说明判断理由。人类 Agent 可以是系统内部的人员。相同现实实体在不同建模范围里可能有不同 affiliation；同一模型内复用同一个 logical Thing 时，不应仅为方便绘图让其不同视觉实例相互矛盾。

## 6. 只在真实触发时使用 Invocation

Invocation `5` 表达一个 Process 直接触发另一个 Process。它不能用来代替排版顺序或把所有同级过程串成流程图。存在重要中间对象（如 `Processed Order`）时，应保留它，并根据是否被创建、改变或仅被需要选择链接；不能机械地把它接成“输出后必然被消耗”。

## 7. 再补系统结构

先判断要表达的是变换/使能/触发，还是组成/特征/类别。涉及 Process 的关系也可能是结构关系，不能仅凭端点中有 Process 就选 procedural link。

| 结构事实 | 原生关系与项目方向 | 示例 |
|---|---|---|
| 整体与组成部分 | Aggregation `11`：whole → part | `Coffee Machine` 包含 `Heater`；复合过程可有子过程 |
| 对象的属性或能力 | Exhibition `12`：exhibitor → feature/process | `Coffee Machine` 展现 `Water Capacity` 或 `Coffee Preparing` |
| 类别与子类别 | Generalization `13`：specialized → general | `Electric Vehicle` 是 `Vehicle` 的一种 |
| 具体实例与类别 | Instantiation `14`：instance → class | 某个 VIN 标识的车辆是某车型的实例 |

零件不是属性：`Car consists of Engine`，不要用 Exhibition 来表示零件。Aggregation 不限于物理零件；也可描述合适的逻辑组成或过程分解。属性是特征，不意味着其值永不改变，例如 Temperature 可以变化。

参考涉及的 Tagged Structural Link 是待验证扩展：当前 `NATIVE_LINKS` 注册表未支持。不得猜测编号、改用其他链接硬凑语义，或画带文字的箭头冒充。需要时先报告限制，再验证原生导出、应用行为和桥接支持。

## 8. 命名、身份与布局

Object 使用名词，Process 优先动名词；英文 Things 可用首字母大写，states 可用小写，优先清晰的单数或显式 Group 名称。这些是本指南的风格建议，不是自动判定 ISO 符合性的规则，也不应强制套用到中文名称。

同一概念复用 logical `lid`，不要因换位置而制造重复概念。它在不同 OPD 可以有多个原生视觉表示，每个视觉 `id` 唯一；“不要重复 Thing”不等于禁止跨 OPD 复用。新逻辑实体、新视觉实体各自使用新 UUID。

同级 Process 对齐；输入和使能对象放上方或侧边，输出放下方或右侧；State 放父 Object 内。复杂内容通过合适的原生分解管理，不靠大量交叉线堆在一张图里。布局顺序不产生执行语义。

禁止自行修改模型配色：新建 Object、Process、State、链接、文字和图背景使用 OPCloud 原生默认颜色，不通过填充色、边框色、文字色或背景色表达分类或强调。编辑已有模型时保留其颜色字段，不擅自重置配色；新元素使用已核实的原生默认样式，不继承已有元素的自定义颜色。不得通过 CSS、SVG、HTML、canvas 覆盖或图片后处理改色，并在实际渲染中复核。这是项目展示规则，不是 ISO 强制要求，也不限制桥接控制面板的 UI 配色。

## 9. 咖啡机示例：先写关系清单

假设：顾客亲自启动机器，制作过程将水与咖啡原料转化成咖啡，机器在该概括层次作为工具。

- Purpose：顾客获得可饮用咖啡；Main Process：`Coffee Preparing`。
- Consumption：`Water`、`Coffee Ingredient` → `Coffee Preparing`。
- Result：`Coffee Preparing` → `Coffee`。
- Instrument：`Coffee Machine` → `Coffee Preparing`。
- Agent：`Customer` → `Coffee Preparing`，仅在上述亲自参与的假设成立时使用。
- 进一步分析加热时，细化 `Water Heating` 及同一 `Water` 的 `cold → hot`；不要把最终制作中的原料消耗与加热中的状态变化混为一谈。
- 再根据分析目的添加 Water Tank、Heater、Controller 等部件和 Water Capacity 等特征。

本节是解释性示例，不是可导入文件或已验证的 OPCloud 输出。实际生成必须使用完整原生模板，不能把清单或示意图作为最终交付。

## 10. 导入后逐条读 OPL，完成复核

MCP 顺序：读取 `opcloud_get_modeling_guide`（包含本 how-to）与 `opcloud_get_model_template` → `opcloud_status` → 读取并保存当前模型 → 明确意图与关系 → 生成完整模型 → `opcloud_validate_model` → `opcloud_import_model` → `opcloud_get_opl` + `opcloud_review_diagram` → 修改并再次审阅。

当前模型非空时，只有有意替换且已保存或可丢弃，才使用 `replaceExisting: true`。阅读 `warnings`、`semanticChecks`，不要把 `valid: true` 当成审阅完成。无法运行仓库测试时明确报告；可运行时执行 `npm test`。

若预期 `Burning consumes Wood` 却生成 `requires Wood`，应修正模型关系再生成，不能改写 OPL 掩盖错误。检查实际 JPEG 的遗漏、遮挡、状态位置、裁切和交叉线。

交付前回答以下十问：

1. 受益者和获得的价值是否明确？
2. 顶层主功能是否清晰，而不是只列设备？
3. 主过程究竟变换哪个对象？
4. Object、Process 和两种独立属性维度是否区分正确？
5. 已知状态变化是否表达了同一对象的前后状态？
6. Agent/Instrument 是否确实是使能者，而不是被变换者？
7. 是否混淆组成部分、特征、子类别与具体实例？
8. 系统边界及外部交互是否有理由？
9. 每条重要关系的生成 OPL 是否符合意图，实际画布是否清晰？
10. 能否说明 Purpose、Function、Enablers、Environment、Problem Occurrence？

最后五项 SD 内容是用户参考材料中的完整性检查视角，不是必须新增五个节点，也不是每张图都必须虚构“故障”。Problem Occurrence 可以是待解决的问题或未满足需求。通过清单仍不代表完整 ISO 符合性验证。
