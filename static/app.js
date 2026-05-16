const storageKey = "koipy.configAdmin.accessPassword";
const rememberPasswordKey = "koipy.configAdmin.rememberAccessPassword";
const apiBaseKey = "koipy.configAdmin.apiBase";
const localConfigKey = "koipy.configAdmin.localConfig";
const localConfigTemplateKey = "koipy.configAdmin.localConfigTemplate";
const localConfigTemplateVersion = "config-example-v1";
const sensitivePattern = /(password|token|api-hash|license|secret|key)$/i;
const urlPattern = /^(https?:\/\/|socks5:\/\/|ws:\/\/|wss:\/\/|udp:\/\/).+/i;
const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const state = {
  config: null,
  original: null,
  selectedPath: "$",
  activeView: "dashboard",
  dirtyPaths: new Set(),
  validation: "idle",
  health: "pending",
  lastSyncAt: null,
  paths: [],
  showSecrets: false,
  editorTab: "json",
  arrayViews: {},
  apiBase: "",
  backendMode: "remote",
  healthLatencyMs: null,
  healthLatencyPrimed: false,
};

const views = [
  { id: "dashboard", title: "总览 Dashboard", hint: "连接、风险、配置规模和常用操作", roots: [] },
  { id: "basic", title: "基础与权限", hint: "license、admin、user、log-level", roots: ["license", "admin", "user", "log-level"] },
  { id: "webapp", title: "Web 面板设置", hint: "WebUI 监听、认证、TLS 与跨域", roots: ["webapp"] },
  { id: "bot", title: "Bot 设置", hint: "Telegram Bot、代理、命令、回调", roots: ["bot", "callbacks"] },
  { id: "network", title: "网络与订阅", hint: "代理、User-Agent、subconverter", roots: ["network", "subconverter"] },
  { id: "runtime", title: "测试运行时", hint: "测速线程、文件、输出与实时行为", roots: ["runtime"] },
  { id: "scripts", title: "脚本配置", hint: "脚本列表、排序与代码内容", roots: ["scriptConfig"] },
  { id: "slaves", title: "后端配置", hint: "slaveConfig、后端健康检查和节点参数", roots: ["slaveConfig"] },
  { id: "rules", title: "测试规则", hint: "rules 规则卡片、订阅 URL、后端与脚本", roots: ["rules"] },
  { id: "appearance", title: "图片颜色与水印", hint: "image 颜色、速度/延迟渐变、水印预览", roots: ["image"] },
  { id: "translation", title: "本地化配置", hint: "translation.lang、translation.resources", roots: ["translation"] },
];

const FIELD_HELP = {
  "$.license": "激活码，必填，否则 Koipy 无法使用。",
  "$.admin": "管理员 Telegram ID 列表；首次启动可自动设置管理员，不需要时可删除。",
  "$.user": "用户权限名单。推荐通过 /grant 指令维护，手动编辑时填写 Telegram 用户 ID。",
  "$.log-level": "日志文件等级：DEBUG、INFO、WARNING、ERROR、CRITICAL、DISABLE，越靠后越严重；控制台日志等级不受此项影响。",
  "$.network": "网络配置，主要影响订阅获取和外部资源请求。",
  "$.network.httpProxy": "HTTP 代理。设置后，Bot 拉取订阅时会使用此代理。",
  "$.network.socks5Proxy": "SOCKS5 代理。Bot 自身代理请在 bot.proxy 中配置。",
  "$.network.userAgent": "订阅获取时使用的 User-Agent，会影响部分订阅服务端识别。",
  "$.webapp": "内置 Web 配置管理 API 与前端面板配置。",
  "$.webapp.enable": "是否启用内置 Web 配置 API 服务，默认 false。",
  "$.webapp.address": "Web 面板监听地址，格式为 host:port，例如 127.0.0.1:8899。",
  "$.webapp.password": "访问密码。启用 Web API 时必填，所有 /api 请求都需要携带 X-Access-Password。",
  "$.webapp.tls": "是否启用 HTTPS/TLS。",
  "$.webapp.tlsCertFile": "TLS 证书文件，PEM 格式；当 webapp.tls=true 时必填。",
  "$.webapp.tlsKeyFile": "TLS 私钥文件，PEM 格式；如果证书文件已包含私钥可留空。",
  "$.webapp.allowOrigins": "允许跨域访问 Web API 的来源列表。必须填写明确来源，出于安全策略不接受 '*'。",
  "$.bot.bot-token": "Telegram Bot token，首次启动必填；修改后会影响 Bot 登录。",
  "$.bot.api-id": "Telegram api_id，可选；想使用自己的 Telegram API 时填写，默认使用内置配置。",
  "$.bot.api-hash": "Telegram api_hash，可选；想使用自己的 Telegram API 时填写，默认使用内置配置。",
  "$.bot.proxy": "Bot 代理设置，推荐 socks5，也支持 http；目前主要支持这两类代理。",
  "$.bot.ipv6": "是否使用 IPv6 连接。",
  "$.bot.antiGroup": "是否开启防拉群模式，默认 false。",
  "$.bot.strictMode": "严格模式。开启后，Bot 按钮只能由触发原消息的人点击；关闭时按权限放行。",
  "$.bot.bypassMode": "旁路模式。开启后内置指令失效，仅生效 bot.commands 中配置的指令。",
  "$.bot.parseMode": "Bot 文本解析模式，可选 DEFAULT、MARKDOWN、HTML、DISABLED。",
  "$.bot.inviteGroup": "invite 指令权限覆写群组白名单；填写群组 ID 后，该群所有人可使用 /invite。群组 ID 通常以 -100 开头。",
  "$.bot.cacheTime": "订阅缓存最大时长，单位秒。缓存期内同一订阅不会重复拉取，超过后重新获取。",
  "$.bot.echoLimit": "Bot 响应限速，单位秒；也会影响按钮响应频率。",
  "$.bot.inviteBlacklistURL": "邀请测试中禁止测试的 URL 远程更新地址列表。",
  "$.bot.inviteBlacklistDomain": "邀请测试中禁止测试的域名远程更新地址列表。",
  "$.bot.autoResetCommands": "是否自动重置 Bot 指令。开启后每次启动会清除 Telegram 前端原有固定指令。",
  "$.bot.commands": "Bot 指令配置列表，可把指令绑定到测试规则或仅修改描述文本。",
  "$.bot.commands[].name": "指令名称，例如 ping；特殊 name=invite 可覆写或禁用内置 invite 按钮行为。",
  "$.bot.commands[].title": "绘图时显示的任务标题。",
  "$.bot.commands[].enable": "是否启用该指令。未启用时无法使用该指令。",
  "$.bot.commands[].rule": "将指令升级为测试指令时填写规则名；读取不到对应规则时会被当作普通指令。",
  "$.bot.commands[].pin": "是否固定指令。固定后会显示在 Telegram 客户端指令列表中；不固定相当于隐藏指令。",
  "$.bot.commands[].text": "指令提示文本；留空时默认使用 name。",
  "$.bot.commands[].attachToInvite": "是否附加到 invite 指令按钮，让 invite 也能使用此规则背后的 script 选择。",
  "$.callbacks.onMessage": "HTTP 回调地址。Bot 收到消息时会向此地址发送 POST 请求。",
  "$.callbacks.onPreSend": "HTTP 回调地址。Bot 完成前置动作后会向此地址发送 POST 请求。",
  "$.callbacks.onResult": "HTTP 回调地址。Bot 接收测试结果后会向此地址发送 POST 请求，可用于添加或修改结果数据。",
  "$.runtime": "测速任务可动态调整的全局配置，可被规则中的 runtime 覆盖。",
  "$.runtime.entrance": "是否显示入口 IP 段。",
  "$.runtime.duration": "测速时长，优先级高于后端单独设置的测速时长。",
  "$.runtime.ipstack": "是否启用双栈检测。",
  "$.runtime.localip": "暂时无用。",
  "$.runtime.nospeed": "暂时无用。",
  "$.runtime.pingURL": "延迟测试地址。",
  "$.runtime.speedFiles": "速度测试的大文件下载地址列表；后端 downloadURL 使用 DYNAMIC:ALL 时会从这里随机选择。",
  "$.runtime.speedNodes": "最大测速节点数量。",
  "$.runtime.speedThreads": "后端测速线程数量，优先级高于后端单独设置。",
  "$.runtime.includeFilter": "只测试匹配该关键字或正则的节点。",
  "$.runtime.excludeFilter": "排除匹配该关键字或正则的节点。",
  "$.runtime.sort": "测试结果排序方式。",
  "$.runtime.output": "输出类型，目前支持 image、json、video；video 非 Docker 启动时需要自行安装并配置 ffmpeg。",
  "$.runtime.realtime": "是否实时渲染测试结果。",
  "$.runtime.disableSubCvt": "是否针对单次测试禁用订阅转换；配合 rule 或指令参数使用。",
  "$.runtime.protectContent": "Bot 输出图片是否设置为保护内容。开启后图片不允许转发或复制。",
  "$.runtime.enableDNSInject": "是否启用 mihomo DNS 注入。开启后读取订阅 dns 字段并编码为 mihomo://base64 插入后端 dnsServer 第一项。",
  "$.scriptConfig.scripts": "脚本载入列表。脚本可来自 miaospeed 内置实现、gojajs 文件路径或内联源码。",
  "$.scriptConfig.scripts[].type": "脚本类型。可用值只有 gojajs 和 gofunc；gojajs 是 JavaScript 脚本引擎类型，gofunc 是 miaospeed 内部 Go 实现。",
  "$.scriptConfig.scripts[].name": "脚本名称。gojajs 可写非保留名的任意字符串；使用预保留名称时会覆写内部程序的预留配置。",
  "$.scriptConfig.scripts[].rank": "排序值，越小越靠前。",
  "$.scriptConfig.scripts[].content": "脚本内容。可以填写脚本源码，也可以指定文件路径；预保留名称中只有 GEOIP_INBOUND 和 GEOIP_OUTBOUND 可以覆写 content。",
  "$.slaveConfig.healthCheck": "checkslave 后端健康检查配置。",
  "$.slaveConfig.healthCheck.numSamples": "健康检查样本数量，单位为整数次数，默认采样 10 次 PING 测试数据。",
  "$.slaveConfig.healthCheck.showStatusStyle": "后端选择页面展示状态的样式：emoji、number、default。",
  "$.slaveConfig.healthCheck.autoHideOnFailure": "健康检查失败时是否自动隐藏后端，默认 false。",
  "$.slaveConfig.showID": "是否在选择后端页面展示 slaveid。",
  "$.slaveConfig.speedScheduling": "后端测速任务调度模式：concurrent 并发、pipeline 流水线、sequential 串行。",
  "$.slaveConfig.geoClustering": "是否开启拓扑结果聚类排序。开启后相同或相近结果会靠近排列，使图片更整洁。",
  "$.slaveConfig.slaves": "后端列表，数组类型。",
  "$.slaveConfig.slaves[].type": "后端类型。示例中 miaospeed 为固定支持类型；UI 也保留其他兼容类型。",
  "$.slaveConfig.slaves[].id": "后端 ID，用于规则 slaveid 选择和 Bot 页面显示。",
  "$.slaveConfig.slaves[].token": "后端连接密码，修改会影响握手认证。",
  "$.slaveConfig.slaves[].address": "后端地址，通常为 host:port，例如 127.0.0.1:8765。",
  "$.slaveConfig.slaves[].path": "WebSocket 连接路径。建议使用复杂路径，避免后端被扫描或爆破。",
  "$.slaveConfig.slaves[].skipCertVerify": "是否跳过证书验证。不确定时保持默认值。",
  "$.slaveConfig.slaves[].tls": "是否启用加密连接。不确定时保持默认值。",
  "$.slaveConfig.slaves[].invoker": "Bot 调用者字段，可删除或填写任意字符串。",
  "$.slaveConfig.slaves[].buildtoken": "默认编译 token；不了解用途时保持默认值。",
  "$.slaveConfig.slaves[].comment": "后端备注，会显示在 Bot 页面。",
  "$.slaveConfig.slaves[].hidden": "是否隐藏此后端。",
  "$.slaveConfig.slaves[].option": "后端可选配置。注意部分值设置过大可能不会生效。",
  "$.slaveConfig.slaves[].option.downloadDuration": "后端下载测速时长。",
  "$.slaveConfig.slaves[].option.downloadThreading": "后端下载测速线程数。",
  "$.slaveConfig.slaves[].option.downloadURL": "测速大文件 URL。特殊值 DYNAMIC:ALL 表示从 runtime.speedFiles 或 rule.runtime.speedFiles 随机选择。",
  "$.slaveConfig.slaves[].option.pingAddress": "后端延迟测试地址。",
  "$.slaveConfig.slaves[].option.pingAverageOver": "Ping 多少次后取平均。",
  "$.slaveConfig.slaves[].option.stunURL": "STUN 地址，用于测试 UDP 连通性，格式为 udp://host:port。",
  "$.slaveConfig.slaves[].option.taskRetry": "后端任务重试配置。",
  "$.slaveConfig.slaves[].option.taskTimeout": "后端任务超时判定时长，单位毫秒。",
  "$.slaveConfig.slaves[].option.dnsServer": "后端指定 DNS 服务器。支持普通 DNS、DoH，也可使用 mihomo://base64 配置。",
  "$.slaveConfig.slaves[].option.apiVersion": "后端 API 版本。0 或 1 可适配旧版后端；无必要请勿修改。",
  "$.slaveConfig.slaves[].option.uploadURL": "apiVersion=3 独有，上行速度测试自定义 URL。",
  "$.slaveConfig.slaves[].option.uploadDuration": "apiVersion=3 独有，上行速度测试时长。",
  "$.slaveConfig.slaves[].option.uploadThreading": "apiVersion=3 独有，上行速度测试线程数。",
  "$.rules": "测试规则列表。每条规则组合订阅 URL、后端、运行时覆盖项和脚本。",
  "$.rules[].name": "规则名称，也是命令绑定 rule 时使用的名称。",
  "$.rules[].url": "订阅链接。",
  "$.rules[].owner": "规则创建者 Telegram ID。",
  "$.rules[].slaveid": "填写后端 ID；数组形式可配置多个后端，代表多后端联测。",
  "$.rules[].runtime": "支持主配置 runtime 的所有值，用于覆盖当前规则的运行时参数。",
  "$.rules[].script": "填写脚本配置名称，也支持 TEST_PING_RTT 等预保留名称。",
  "$.subconverter": "订阅转换对接配置，可把 base64 格式转换成 Bot 测试需要的 Clash 格式。",
  "$.subconverter.enable": "是否启用订阅转换。",
  "$.subconverter.mode": "用于推断默认 Host/Port/Target；示例支持 subconverter / substore。",
  "$.subconverter.template.backend": "订阅转换后端模板 URL。链接作为 query 参数时推荐使用 $EncodedURL。",
  "$.subconverter.defaults": "订阅转换默认值，可包含 host、port、scheme、target 以及自定义键。",
  "$.subconverter.defaults.target": "订阅转换目标。mode=substore 或模板包含 /download/sub 时默认 ClashMeta。",
  "$.image.speedFormat": "速度结果绘图格式：byte/binary、byte/decimal、bit/binary、bit/decimal。",
  "$.image.color": "结果图颜色配置。",
  "$.image.color.background": "背景颜色配置。",
  "$.image.color.background.*.value": "对应区域的背景颜色，使用 HEX 色值。",
  "$.image.color.delay": "延迟配色。label 表示阈值，单位 ms；超过该值采用对应颜色。",
  "$.image.color.speed": "速度值颜色。label 表示速度阈值，超过该值采用对应颜色。",
  "$.image.color.*.alpha": "透明度，通常 0-255。",
  "$.image.color.*.end-color": "渐变结束颜色。",
  "$.image.color.*.end_color": "渐变结束颜色。",
  "$.image.color.*.label": "阈值或排序标签，具体含义取决于所在配色组。",
  "$.image.color.*.name": "颜色名称或显示名，可按需要填写。",
  "$.image.color.*.value": "颜色值，通常为 HEX。",
  "$.image.compress": "是否压缩图片。",
  "$.image.emoji.enable": "是否启用 emoji，示例建议开启。",
  "$.image.emoji.source": "emoji 来源。",
  "$.image.endColorsSwitch": "是否开启结束颜色配置。",
  "$.image.font": "绘图字体文件路径。",
  "$.image.speedEndColorSwitch": "是否开启速度渐变色。",
  "$.image.invert": "是否将图片反色。与透明度模式不兼容，开启后透明度会失效。",
  "$.image.save": "是否保存图片到本地。false 时不会保存结果图备份。",
  "$.image.pixelThreshold": "图片像素阈值，格式：宽x高，例如 2500x3500；超过阈值则发送原图，否则发送压缩图。",
  "$.image.title": "结果图标题。",
  "$.image.logo": "是否在绘图类型中显示协议相关 logo。",
  "$.image.watermark": "水印配置。",
  "$.image.watermark.alpha": "水印透明度。",
  "$.image.watermark.angle": "水印旋转角度。",
  "$.image.watermark.color.value": "水印颜色。",
  "$.image.watermark.enable": "是否启用水印。",
  "$.image.watermark.row-spacing": "水印行间距。",
  "$.image.watermark.shadow": "水印阴影，示例注明暂未实现。",
  "$.image.watermark.size": "水印字号或绘制大小。",
  "$.image.watermark.start-y": "水印开始绘制的 Y 坐标。",
  "$.image.watermark.text": "水印内容。",
  "$.image.watermark.trace": "UID 追踪。开启后结果图显示任务发起人 UID，并在 Telegram 发送图片时打上关联 UID 的 tag。",
  "$.translation": "翻译语言包配置。",
  "$.translation.lang": "启用哪个语言包，值为 translation.resources 中配置的键，默认 zh-CN。",
  "$.translation.resources": "翻译包加载位置；键可自定义，值为 YAML 文件路径。",
  "$.translation.resources.*": "语言资源映射项。左侧填写语言包键名，右侧填写对应 YAML 文件路径。",
};

const SCRIPT_RESERVED_NAMES = [
  ["TEST_PING_RTT", "TCP RTT（数据交换延迟测试）"],
  ["TEST_PING_CONN", "HTTP 请求体感延迟测试"],
  ["GEOIP_INBOUND", "入口拓扑测试（地理 IP 路径分析）"],
  ["GEOIP_OUTBOUND", "出口拓扑测试（地理 IP 路径分析）"],
  ["SPEED_AVERAGE", "平均下行速度"],
  ["SPEED_MAX", "最大下行速度"],
  ["SPEED_PER_SECOND", "每秒下行速度"],
  ["UDP_TYPE", "UDP 行为发现"],
  ["TEST_PING_MAX_RTT", "最大 RTT（往返时延峰值）"],
  ["TEST_PING_TOTAL_CONN", "总 HTTP 请求延迟（所有请求的累计值）"],
  ["TEST_PING_TOTAL_RTT", "总 RTT（所有数据包往返时延总和）"],
  ["TEST_PING_SD_RTT", "RTT 标准差（延迟波动指标）"],
  ["TEST_PING_SD_CONN", "HTTP 请求延迟标准差（访问网页稳定性）"],
  ["TEST_PING_PACKET_LOSS", "RTT 丢包率（数据包丢失百分比）"],
  ["TEST_HTTP_CODE", "目标 PING 地址的 HTTP 状态码"],
  ["USPEED_AVERGE", "平均上行速度"],
  ["USPEED_MAX", "最大上行速度"],
  ["USPEED_PER_SECOND", "每秒上行速度"],
  ["TEST_HIJACK_DETECTION", "测速劫持检测"],
].map(([value, description]) => ({ value, description }));

const DEFAULT_CONFIG = {
  license: "",
  admin: [],
  user: [],
  "log-level": "INFO",
  network: {
    httpProxy: "",
    socks5Proxy: "",
    userAgent: "Koipy Config Console",
  },
  webapp: {
    enable: true,
    address: "127.0.0.1:8899",
    password: "",
    tls: false,
    tlsCertFile: "",
    tlsKeyFile: "",
    allowOrigins: [],
  },
  bot: {
    "bot-token": "",
    "api-id": 0,
    "api-hash": "",
    proxy: "",
    ipv6: false,
    antiGroup: false,
    strictMode: true,
    bypassMode: false,
    parseMode: "DEFAULT",
    inviteGroup: [],
    cacheTime: 600,
    echoLimit: 2,
    inviteBlacklistURL: [],
    inviteBlacklistDomain: [],
    autoResetCommands: false,
    commands: [],
  },
  callbacks: {
    onMessage: "",
    onPreSend: "",
    onResult: "",
  },
  runtime: {
    entrance: true,
    duration: 10,
    ipstack: false,
    localip: false,
    nospeed: false,
    pingURL: "https://www.gstatic.com/generate_204",
    speedFiles: [],
    speedNodes: 300,
    speedThreads: 4,
    includeFilter: "",
    excludeFilter: "",
    sort: "订阅原序",
    output: "image",
    realtime: false,
    disableSubCvt: false,
    protectContent: false,
    enableDNSInject: false,
  },
  scriptConfig: {
    scripts: [],
  },
  slaveConfig: {
    healthCheck: {
      numSamples: 10,
      showStatusStyle: "default",
      autoHideOnFailure: false,
    },
    showID: true,
    speedScheduling: "concurrent",
    geoClustering: false,
    slaves: [],
  },
  rules: [],
  subconverter: {
    enable: false,
    mode: "subconverter",
    template: {
      backend: "",
    },
    defaults: {
      target: "ClashMeta",
    },
  },
  image: {
    speedFormat: "byte/decimal",
    title: "Koipy",
    logo: true,
    pixelThreshold: 0,
    font: "",
    compress: true,
    invert: false,
    save: false,
    endColorsSwitch: false,
    speedEndColorSwitch: false,
    emoji: {
      enable: true,
      source: "",
    },
    color: {
      background: {
        title: { value: "#f8fafc" },
        body: { value: "#ffffff" },
        odd: { value: "#f1f5f9" },
        even: { value: "#ffffff" },
      },
      delay: [
        { label: 100, name: "good", value: "#22c55e", alpha: 255, end_color: "#dcfce7" },
        { label: 500, name: "warn", value: "#f59e0b", alpha: 255, end_color: "#fef3c7" },
        { label: 1000, name: "bad", value: "#ef4444", alpha: 255, end_color: "#fee2e2" },
      ],
      speed: [
        { label: 0, name: "slow", value: "#94a3b8", alpha: 255, end_color: "#e2e8f0" },
        { label: 25, name: "fast", value: "#14b8a6", alpha: 255, end_color: "#ccfbf1" },
      ],
    },
    watermark: {
      enable: false,
      text: "",
      alpha: 80,
      angle: -20,
      color: { value: "#64748b" },
      "row-spacing": 80,
      shadow: false,
      size: 28,
      "start-y": 0,
      trace: false,
    },
  },
  translation: {
    lang: "zh-CN",
    resources: {
      "zh-CN": "./resources/i18n/zh-CN.yml",
    },
  },
};

let defaultConfigTemplate = DEFAULT_CONFIG;

const el = {
  nav: document.querySelector("#section-nav"),
  viewTitle: document.querySelector("#view-title"),
  viewSubtitle: document.querySelector("#view-subtitle"),
  viewStack: document.querySelector("#view-stack"),
  search: document.querySelector("#global-search"),
  searchResults: document.querySelector("#search-results"),
  apiBase: document.querySelector("#api-base"),
  apiBaseHint: document.querySelector("#api-base-hint"),
  password: document.querySelector("#access-password"),
  rememberPassword: document.querySelector("#remember-access-password"),
  toggleAccess: document.querySelector("#toggle-access-password"),
  reload: document.querySelector("#reload-config"),
  validate: document.querySelector("#validate-draft"),
  memory: document.querySelector("#write-memory"),
  save: document.querySelector("#save-file"),
  saveReload: document.querySelector("#save-reload"),
  discardReload: document.querySelector("#discard-reload"),
  exportYaml: document.querySelector("#export-yaml"),
  refreshYaml: document.querySelector("#refresh-yaml"),
  syncJson: document.querySelector("#sync-json"),
  applyJson: document.querySelector("#apply-json"),
  jsonEditor: document.querySelector("#json-editor"),
  yamlEditor: document.querySelector("#yaml-editor"),
  healthText: document.querySelector("#health-text"),
  connectionBar: document.querySelector("#connection-bar"),
  navHealthText: document.querySelector("#nav-health-text"),
  navHealthLatency: document.querySelector("#nav-health-latency"),
  navHealthDot: document.querySelector("#nav-health-dot"),
  draftText: document.querySelector("#draft-text"),
  fieldCount: document.querySelector("#field-count"),
  validationText: document.querySelector("#validation-text"),
  syncTime: document.querySelector("#sync-time"),
  navSyncTime: document.querySelector("#nav-sync-time"),
  inspectorPath: document.querySelector("#inspector-path"),
  inspectorType: document.querySelector("#inspector-type"),
  inspectorSummary: document.querySelector("#inspector-summary"),
  inspectorRisk: document.querySelector("#inspector-risk"),
  inspectorJson: document.querySelector("#inspector-json"),
  copyPath: document.querySelector("#copy-path"),
  restoreField: document.querySelector("#restore-field"),
  deleteField: document.querySelector("#delete-field"),
  toastRegion: document.querySelector("#toast-region"),
  scrollTools: document.querySelector("#scroll-tools"),
  scrollTop: document.querySelector("#scroll-to-top"),
  scrollBottom: document.querySelector("#scroll-to-bottom"),
  modalHost: document.querySelector("#modal-host"),
};

function headers(json = false) {
  const result = { Accept: "application/json" };
  if (json) result["Content-Type"] = "application/json";
  const password = el.password.value.trim();
  if (password) result["X-Access-Password"] = password;
  return result;
}

function syncPasswordStorage() {
  if (!el.rememberPassword?.checked) {
    window.localStorage.removeItem(rememberPasswordKey);
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(rememberPasswordKey, "1");
  const password = el.password.value.trim();
  if (password) window.localStorage.setItem(storageKey, password);
  else window.localStorage.removeItem(storageKey);
}

function normalizeApiBase(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  let candidate = raw;
  if (candidate.startsWith("//")) candidate = `${window.location.protocol}${candidate}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    if (candidate.startsWith("/")) {
      candidate = `${window.location.origin}${candidate}`;
    } else {
      candidate = `http://${candidate}`;
    }
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("API 地址格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API 地址仅支持 http 或 https");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  const suffix = pathname && pathname !== "/" ? pathname : "";
  return `${url.origin}${suffix}`;
}

function syncApiBaseStorage() {
  if (state.apiBase) window.localStorage.setItem(apiBaseKey, state.apiBase);
  else window.localStorage.removeItem(apiBaseKey);
}

function applyApiBase(rawValue, { silent = false } = {}) {
  if (String(rawValue || "").trim().toLowerCase() === "local") {
    state.apiBase = "";
    state.backendMode = "local";
    if (el.apiBase) el.apiBase.value = "";
    syncApiBaseStorage();
    if (el.apiBaseHint) el.apiBaseHint.textContent = "当前 API：浏览器本地模式";
    if (!silent) toast("API 地址已更新", "已切换为浏览器本地模式。");
    return;
  }
  const normalized = normalizeApiBase(rawValue);
  state.apiBase = normalized;
  state.backendMode = "remote";
  if (el.apiBase && el.apiBase.value !== normalized) el.apiBase.value = normalized;
  syncApiBaseStorage();
  const hint = normalized
    ? `当前 API：${normalized}`
    : (window.location.protocol === "file:"
      ? "当前未设置 API 地址（file:// 模式必须填写）"
      : `当前 API：同源（${window.location.origin}）`);
  if (el.apiBaseHint) el.apiBaseHint.textContent = hint;
  if (!silent) toast("API 地址已更新", normalized || "已切换为同源 API。");
}

function apiUrl(path) {
  const targetPath = String(path || "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(targetPath)) return targetPath;
  const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  if (!state.apiBase) {
    if (window.location.protocol === "file:") {
      throw new Error("当前页面通过 file:// 打开，请先填写 API 地址。");
    }
    return normalizedPath;
  }
  return `${state.apiBase}${normalizedPath}`;
}

async function api(path, options = {}) {
  if (state.backendMode === "local" || wantsLocalBackend()) {
    return localApi(path, options);
  }
  const response = await fetch(apiUrl(path), {
    method: options.method || "GET",
    headers: { ...headers(options.body !== undefined), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { success: response.ok, error: await response.text() };
  if (!response.ok || payload.success === false) {
    const detail = payload.details ? `: ${payload.details}` : "";
    throw new Error(`${payload.error || response.statusText}${detail}`);
  }
  return payload.data ?? payload;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value === "object" ? "object" : typeof value;
}

function tokenize(path) {
  if (!path || path === "$") return [];
  const source = path.startsWith("$.") ? path.slice(2) : path.replace(/^\$/, "");
  const tokens = [];
  let part = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === ".") {
      if (part) tokens.push(part);
      part = "";
      continue;
    }
    if (char === "[") {
      if (part) tokens.push(part);
      part = "";
      const end = source.indexOf("]", i);
      tokens.push(Number(source.slice(i + 1, end)));
      i = end;
      continue;
    }
    part += char;
  }
  if (part) tokens.push(part);
  return tokens;
}

function pathOf(tokens) {
  if (!tokens.length) return "$";
  return tokens.reduce((path, token) => typeof token === "number" ? `${path}[${token}]` : `${path}.${token}`, "$");
}

function getAt(root, path, fallback = undefined) {
  try {
    const value = tokenize(path).reduce((current, token) => current?.[token], root);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function setAt(root, path, value) {
  const tokens = tokenize(path);
  if (!tokens.length) {
    state.config = value;
    return;
  }
  const last = tokens.pop();
  const parent = tokens.reduce((current, token, index) => {
    if (current[token] === undefined || current[token] === null) {
      current[token] = typeof tokens[index + 1] === "number" ? [] : {};
    }
    return current[token];
  }, root);
  parent[last] = value;
}

function deleteAt(root, path) {
  const tokens = tokenize(path);
  const last = tokens.pop();
  const parent = tokens.reduce((current, token) => current[token], root);
  if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
  else delete parent[last];
}

function wantsLocalBackend() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "local" || params.get("apiBase") === "local";
}

function shouldUseGeneratorMode() {
  return wantsLocalBackend() || (!state.apiBase && window.location.hostname.endsWith("github.io"));
}

function mergeDefaults(value, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(value) ? value : clone(defaults);
  if (!defaults || typeof defaults !== "object") return value === undefined ? defaults : value;
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => [
    key,
    mergeDefaults(source[key], defaultValue),
  ]).concat(Object.entries(source).filter(([key]) => !(key in defaults))));
}

async function loadDefaultConfigTemplate() {
  try {
    const response = await fetch(new URL("./static/default-config.json", window.location.href), { cache: "no-cache" });
    if (!response.ok) throw new Error(response.statusText);
    const template = await response.json();
    if (template && typeof template === "object" && !Array.isArray(template)) {
      defaultConfigTemplate = mergeDefaults(template, DEFAULT_CONFIG);
    }
  } catch {
    defaultConfigTemplate = DEFAULT_CONFIG;
  }
}

function readLocalConfig() {
  try {
    const raw = window.localStorage.getItem(localConfigKey);
    const templateVersion = window.localStorage.getItem(localConfigTemplateKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (templateVersion === localConfigTemplateVersion && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return mergeDefaults(parsed, defaultConfigTemplate);
      }
    }
  } catch {
    window.localStorage.removeItem(localConfigKey);
  }
  const initial = clone(defaultConfigTemplate);
  writeLocalConfig(initial);
  return initial;
}

function writeLocalConfig(config) {
  window.localStorage.setItem(localConfigKey, JSON.stringify(config));
  window.localStorage.setItem(localConfigTemplateKey, localConfigTemplateVersion);
}

function validateLocalConfig(config) {
  const errors = [];
  const mustBeObject = (path) => {
    const value = getAt(config, path);
    if (!value || typeof value !== "object" || Array.isArray(value)) errors.push(`${path} 必须是对象`);
  };
  const mustBeArray = (path) => {
    if (!Array.isArray(getAt(config, path))) errors.push(`${path} 必须是数组`);
  };
  if (!config || typeof config !== "object" || Array.isArray(config)) errors.push("$ 必须是配置对象");
  ["$.network", "$.webapp", "$.bot", "$.callbacks", "$.runtime", "$.scriptConfig", "$.slaveConfig", "$.subconverter", "$.image", "$.translation"].forEach(mustBeObject);
  ["$.admin", "$.user", "$.webapp.allowOrigins", "$.bot.inviteGroup", "$.bot.inviteBlacklistURL", "$.bot.inviteBlacklistDomain", "$.runtime.speedFiles", "$.scriptConfig.scripts", "$.slaveConfig.slaves", "$.rules"].forEach(mustBeArray);
  const logLevel = getAt(config, "$.log-level");
  if (logLevel && !["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", "DISABLE"].includes(logLevel)) {
    errors.push("$.log-level 不是已知日志等级");
  }
  const parseMode = getAt(config, "$.bot.parseMode");
  if (parseMode && !["DEFAULT", "MARKDOWN", "HTML", "DISABLED"].includes(parseMode)) {
    errors.push("$.bot.parseMode 不是已知解析模式");
  }
  const output = getAt(config, "$.runtime.output");
  if (output && !["image", "json", "video"].includes(output)) {
    errors.push("$.runtime.output 不是已知输出模式");
  }
  const webapp = getAt(config, "$.webapp", {});
  if (webapp.tls && (!webapp.tlsCertFile || !webapp.tlsKeyFile)) {
    errors.push("TLS 已开启但证书或私钥路径为空");
  }
  if (errors.length) throw new Error(errors.join("；"));
  return true;
}

function localApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const payload = options.body || {};
  if (path === "/api/health" && method === "GET") {
    return { status: "ok", mode: "generator" };
  }
  if (path === "/api/config" && method === "GET") {
    return { config: readLocalConfig(), mode: "generator" };
  }
  if (path === "/api/config" && method === "PUT") {
    const nextConfig = mergeDefaults(payload.config, defaultConfigTemplate);
    validateLocalConfig(nextConfig);
    writeLocalConfig(nextConfig);
    return { config: nextConfig, mode: "generator" };
  }
  if (path === "/api/config/validate" && method === "POST") {
    validateLocalConfig(mergeDefaults(payload.config, defaultConfigTemplate));
    return { success: true, mode: "generator" };
  }
  if (path === "/api/config/apply" && method === "POST") {
    return { success: true, mode: "generator", applied: payload.mode || "save" };
  }
  throw new Error(`本地模式不支持 ${method} ${path}`);
}

function yamlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(String(key)) ? String(key) : JSON.stringify(String(key));
}

function yamlScalar(value, indent = 0) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  if (text.includes("\n")) {
    const pad = " ".repeat(indent + 2);
    return `|\n${text.split("\n").map((line) => `${pad}${line}`).join("\n")}`;
  }
  if (
    text === ""
    || /^\s|\s$/.test(text)
    || /^[!&*#[\]{},?:>|%@`-]/.test(text)
    || /:\s|#/.test(text)
    || /^(true|false|null|yes|no|on|off)$/i.test(text)
    || /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)
  ) {
    return JSON.stringify(text);
  }
  return text;
}

function yamlStringify(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    return value.map((item) => {
      if (Array.isArray(item) && !item.length) return `${pad}- []`;
      if (item && typeof item === "object" && !Array.isArray(item) && !Object.keys(item).length) return `${pad}- {}`;
      if (item && typeof item === "object") return `${pad}-\n${yamlStringify(item, indent + 2)}`;
      return `${pad}- ${yamlScalar(item, indent)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries.map(([key, child]) => {
      if (Array.isArray(child) && !child.length) return `${pad}${yamlKey(key)}: []`;
      if (child && typeof child === "object" && !Array.isArray(child) && !Object.keys(child).length) return `${pad}${yamlKey(key)}: {}`;
      if (child && typeof child === "object") return `${pad}${yamlKey(key)}:\n${yamlStringify(child, indent + 2)}`;
      return `${pad}${yamlKey(key)}: ${yamlScalar(child, indent)}`;
    }).join("\n");
  }
  return `${pad}${yamlScalar(value, indent)}`;
}

async function apiText(path, options = {}) {
  if (state.backendMode === "local" || wantsLocalBackend()) {
    if (path === "/api/config/export") return `${yamlStringify(state.config || readLocalConfig())}\n`;
    throw new Error(`本地模式不支持导出 ${path}`);
  }
  const response = await fetch(apiUrl(path), {
    method: options.method || "GET",
    headers: { ...headers(false), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(await response.text() || response.statusText);
  return response.text();
}

function childCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function buildPaths(value, path = "$", key = "config", description = "") {
  const row = [{ path, key, type: typeOf(value), value, description }];
  if (Array.isArray(value)) {
    value.forEach((item, index) => row.push(...buildPaths(item, `${path}[${index}]`, `[${index}]`)));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => {
      const childPath = path === "$" ? `$.${childKey}` : `${path}.${childKey}`;
      row.push(...buildPaths(childValue, childPath, childKey, labelFor(childPath)));
    });
  }
  return row;
}

function labelFor(path) {
  return helpFor(path, "");
}

function normalizeHelpPath(path) {
  return String(path).replace(/\[\d+\]/g, "[]");
}

function wildcardHelpPath(path) {
  const normalized = normalizeHelpPath(path);
  if (/^\$\.image\.color\.background\.[^.]+\.value$/.test(normalized)) {
    return "$.image.color.background.*.value";
  }
  if (/^\$\.translation\.resources\.[^.]+$/.test(normalized)) {
    return "$.translation.resources.*";
  }
  if (/^\$\.image\.color\.[^.]+(?:\[\])?\.(alpha|end-color|end_color|label|name|value)$/.test(normalized)) {
    return normalized.replace(/^(\$\.image\.color)\.[^.]+(?:\[\])?\.(alpha|end-color|end_color|label|name|value)$/, "$1.*.$2");
  }
  return "";
}

function helpFor(path, fallback = "") {
  const normalized = normalizeHelpPath(path);
  const wildcard = wildcardHelpPath(path);
  if (normalized.startsWith("$.rules[].runtime.")) {
    const runtimePath = normalized.replace("$.rules[].runtime", "$.runtime");
    const runtimeHelp = FIELD_HELP[runtimePath];
    if (runtimeHelp) return `规则级覆盖项。${runtimeHelp}`;
  }
  return FIELD_HELP[path]
    || FIELD_HELP[normalized]
    || (wildcard ? FIELD_HELP[wildcard] : "")
    || fallback
    || `字段路径：${path}。修改会先进入本地草稿，校验并保存后生效。`;
}

function helpTooltip(text) {
  const safe = escapeHtml(text);
  return `<span class="help-tip" tabindex="0" role="img" aria-label="字段说明：${safe}" title="${safe}">?<span class="help-popover" role="tooltip">${safe}</span></span>`;
}

function mask(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (state.showSecrets || text.length <= 8) return text;
  return `${text.slice(0, 3)}${"*".repeat(Math.min(10, text.length - 6))}${text.slice(-3)}`;
}

function isSensitive(path) {
  return sensitivePattern.test(String(tokenize(path).at(-1) || ""));
}

function summarize(value, path = "") {
  if (isSensitive(path)) return mask(value);
  const type = typeOf(value);
  if (type === "object") return `${childCount(value)} 个字段`;
  if (type === "array") return `${childCount(value)} 项`;
  if (type === "string") return value.length > 96 ? `${value.slice(0, 96)}...` : value;
  return String(value);
}

function riskFor(path, value) {
  const risks = [];
  if (isSensitive(path)) risks.push("敏感字段，默认脱敏显示；保存前确认使用安全通道。");
  if (path === "$.webapp.address" && typeof value === "string" && /(^0\.0\.0\.0|:\d+$)/.test(value) && !value.startsWith("127.")) {
    risks.push("可能开放公网访问，请确认访问密码、反向代理和防火墙策略。");
  }
  if (path === "$.webapp.tls" && value === true && (!getAt(state.config, "$.webapp.tlsCertFile") || !getAt(state.config, "$.webapp.tlsKeyFile"))) {
    risks.push("TLS 已开启但证书或私钥路径为空。");
  }
  if (path.includes(".token")) risks.push("修改后端 token 会影响 slave 握手。");
  if (path === "$.rules" && Array.isArray(value) && value.length === 0) risks.push("rules 为空时命令可能没有可执行测试规则。");
  return risks.join(" ");
}

function dangerousChangeMessage(path, value) {
  if (path === "$.bot.bot-token") return "修改 bot-token 会影响 Telegram Bot 登录状态。";
  if (path === "$.webapp.password") return "修改 Web 访问密码后，当前页面后续请求也需要使用新密码。";
  if (/^\$\.slaveConfig\.slaves\[\d+\]\.token$/.test(path)) return "修改 slave token 会影响测速后端握手。";
  if (path === "$.license") return "license 属于敏感授权字段，请确认来源可靠。";
  if (path === "$.webapp.address" && typeof value === "string" && /(^0\.0\.0\.0|^\[::\]|^\*:|:8899$)/.test(value) && !value.startsWith("127.") && !value.startsWith("localhost")) {
    return "监听地址可能暴露到公网，请确认已设置访问密码和网络访问控制。";
  }
  if (path === "$.webapp.tls" && value === true && (!getAt(state.config, "$.webapp.tlsCertFile") || !getAt(state.config, "$.webapp.tlsKeyFile"))) {
    return "TLS 已开启但证书或私钥路径为空，保存重载可能导致 Web 面板启动失败。";
  }
  return "";
}

function toast(title, message = "", tone = "success") {
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}`;
  el.toastRegion.append(node);
  window.setTimeout(() => {
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 180);
  }, 4200);
}

function readableConnectionError(error) {
  const message = String(error?.message || error || "未知错误");
  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    return "浏览器无法访问真实 API。请检查 CORS 是否允许当前 GitHub Pages 域名、API 是否为 HTTPS，以及 API 地址是否只填写到域名。";
  }
  return message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function confirmDanger(title, message) {
  return new Promise((resolve) => {
    el.modalHost.innerHTML = `
      <div class="modal-backdrop">
        <section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <p class="eyebrow">Confirm Risk</p>
          <h3 id="confirm-title">${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-result="cancel">取消</button>
            <button class="button danger" type="button" data-result="ok">确认执行</button>
          </div>
        </section>
      </div>`;
    el.modalHost.querySelector(".modal-backdrop").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-result]");
      if (!button && event.target !== event.currentTarget) return;
      const ok = button?.dataset.result === "ok";
      el.modalHost.innerHTML = "";
      resolve(ok);
    });
  });
}

function markDirty(path) {
  state.dirtyPaths.add(path);
  state.validation = "stale";
  renderChrome();
}

function update(path, value, options = {}) {
  if (state.config === null) return;
  const scroll = options.keepScroll ? { x: window.scrollX, y: window.scrollY } : null;
  const next = clone(state.config);
  setAt(next, path, value);
  state.config = path === "$" ? value : next;
  state.selectedPath = options.select || path;
  markDirty(path);
  render();
  if (scroll) {
    window.requestAnimationFrame(() => window.scrollTo(scroll.x, scroll.y));
  }
}

function updateArray(path, fn, options = {}) {
  const arr = clone(getAt(state.config, path, []));
  const previousMode = state.arrayViews[path]?.mode;
  fn(arr);
  if (previousMode === "all" && options.preserveAll !== false) {
    state.arrayViews[path] = { mode: arr.length > 0 ? "all" : "none", index: Math.min(options.expandIndex ?? 0, Math.max(arr.length - 1, 0)) };
  } else if (options.expandIndex !== undefined) {
    setArraySingle(path, options.expandIndex, arr.length);
  } else {
    normalizeArrayView(path, arr.length);
  }
  update(path, arr, {
    select: options.select || (options.expandIndex !== undefined ? `${path}[${options.expandIndex}]` : path),
    keepScroll: options.keepScroll !== false,
  });
}

function renderPreservingScroll() {
  const scroll = { x: window.scrollX, y: window.scrollY };
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo(scroll.x, scroll.y);
    updateScrollTools();
  });
}

function normalizeArrayView(path, length) {
  let view = state.arrayViews[path];
  if (!view) {
    view = { mode: length > 0 ? "single" : "none", index: 0 };
    state.arrayViews[path] = view;
  }
  if (length <= 0) {
    view.mode = "none";
    view.index = 0;
    return view;
  }
  if (!["single", "all", "none"].includes(view.mode)) view.mode = "single";
  view.index = Math.min(Math.max(Number(view.index) || 0, 0), length - 1);
  return view;
}

function arrayView(path, length) {
  return normalizeArrayView(path, length);
}

function isArrayExpanded(path, index, length) {
  const view = arrayView(path, length);
  if (view.mode === "all") return true;
  if (view.mode === "single") return view.index === index;
  return false;
}

function setArraySingle(path, index, length = childCount(getAt(state.config, path, []))) {
  if (length <= 0) {
    state.arrayViews[path] = { mode: "none", index: 0 };
    return;
  }
  state.arrayViews[path] = {
    mode: "single",
    index: Math.min(Math.max(Number(index) || 0, 0), length - 1),
  };
}

function setArrayMode(path, mode) {
  const length = childCount(getAt(state.config, path, []));
  if (mode === "all") {
    state.arrayViews[path] = { mode: length > 0 ? "all" : "none", index: arrayView(path, length).index };
  } else if (mode === "none") {
    state.arrayViews[path] = { mode: "none", index: arrayView(path, length).index };
  } else {
    setArraySingle(path, arrayView(path, length).index, length);
  }
}

function updateScrollTools() {
  if (!el.scrollTools) return;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const hasScrollableContent = maxScroll > 120;
  el.scrollTools.classList.toggle("is-hidden", !hasScrollableContent);
  if (!hasScrollableContent) return;
  el.scrollTop.disabled = window.scrollY <= 12;
  el.scrollBottom.disabled = window.scrollY >= maxScroll - 12;
}

function insertIndexFor(path, length = childCount(getAt(state.config, path, []))) {
  if (length <= 0) return 0;
  const view = arrayView(path, length);
  if (view.mode === "single") return Math.min(view.index + 1, length);
  return 0;
}

function arrayControls(path, length) {
  const view = arrayView(path, length);
  return `<span class="array-mode" role="group" aria-label="数组展开方式">
    <button class="ghost-chip ${view.mode === "single" ? "is-active" : ""}" type="button" data-array-single="${path}">单项</button>
    <button class="ghost-chip ${view.mode === "all" ? "is-active" : ""}" type="button" data-array-expand-all="${path}">全部展开</button>
    <button class="ghost-chip ${view.mode === "none" ? "is-active" : ""}" type="button" data-array-collapse-all="${path}">全部收起</button>
  </span>`;
}

function arrayItemSummary(item, index, fallback = "数组项") {
  if (item && typeof item === "object") {
    const label = item.name || item.id || item.title || item.comment || item.url || `${fallback} ${index + 1}`;
    const detail = item.url || item.address || item.content || item.rule || item.type || summarize(item);
    return { label: String(label), detail: String(detail || "") };
  }
  return { label: `${fallback} ${index + 1}`, detail: summarize(item) };
}

function renderChrome() {
  const view = views.find((item) => item.id === state.activeView) || views[0];
  el.viewTitle.textContent = view.title;
  el.viewSubtitle.textContent = view.hint;
  el.healthText.textContent = state.health === "online" ? "已连接" : state.health === "local" ? "本地模式" : state.health === "error" ? "连接失败" : "连接中";
  if (el.connectionBar) el.connectionBar.dataset.health = state.health;
  el.navHealthText.textContent = el.healthText.textContent;
  if (el.navHealthLatency) {
    if (state.health === "pending") {
      el.navHealthLatency.textContent = "测试中";
      el.navHealthLatency.dataset.tone = "pending";
    } else if (state.health === "local") {
      el.navHealthLatency.textContent = "生成器";
      el.navHealthLatency.dataset.tone = "local";
    } else if (state.health === "online" && Number.isFinite(state.healthLatencyMs)) {
      el.navHealthLatency.textContent = `${state.healthLatencyMs} ms`;
      el.navHealthLatency.dataset.tone = state.healthLatencyMs < 120 ? "good" : state.healthLatencyMs < 300 ? "warn" : "bad";
    } else {
      el.navHealthLatency.textContent = "-- ms";
      el.navHealthLatency.dataset.tone = "unknown";
    }
  }
  el.navHealthDot.className = `status-dot ${state.health}`;
  el.draftText.textContent = !state.config ? "未加载" : state.dirtyPaths.size ? `${state.dirtyPaths.size} 处未保存` : "已同步";
  el.fieldCount.textContent = String(Math.max(state.paths.length - 1, 0));
  el.validationText.textContent = state.validation === "pass" ? "通过" : state.validation === "fail" ? "失败" : state.validation === "stale" ? "草稿已变更" : "未校验";
  const time = state.lastSyncAt ? state.lastSyncAt.toLocaleTimeString("zh-CN", { hour12: false }) : "--";
  el.syncTime.textContent = time;
  el.navSyncTime.textContent = state.lastSyncAt ? time : "尚未同步";
}

function renderNav() {
  el.nav.innerHTML = "";
  views.forEach((view) => {
    const count = view.roots.length ? state.paths.filter((node) => view.roots.includes(tokenize(node.path)[0])).length : state.paths.length;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = view.id;
    button.className = "nav-item";
    button.setAttribute("aria-current", String(view.id === state.activeView));
    button.innerHTML = `<span><strong>${view.title}</strong><small>${view.hint}</small></span><em>${Math.max(count - (view.id === "dashboard" ? 1 : 0), 0)}</em>`;
    el.nav.append(button);
  });
}

function renderInspector() {
  const value = getAt(state.config, state.selectedPath);
  const type = typeOf(value);
  el.inspectorPath.textContent = state.selectedPath;
  el.inspectorType.textContent = type;
  el.inspectorSummary.textContent = summarize(value, state.selectedPath);
  el.inspectorRisk.textContent = riskFor(state.selectedPath, value) || "无";
  el.inspectorJson.value = value === undefined ? "" : JSON.stringify(value, null, 2);
  el.deleteField.disabled = state.selectedPath === "$" || state.config === null;
  el.restoreField.disabled = state.config === null || getAt(state.original, state.selectedPath) === undefined;
}

function renderSearch() {
  const query = el.search.value.trim().toLowerCase();
  el.searchResults.classList.toggle("is-hidden", !query);
  if (!query) return;
  const matches = state.paths.filter((node) => `${node.path} ${node.key} ${node.type} ${node.description} ${summarize(node.value, node.path)}`.toLowerCase().includes(query)).slice(0, 60);
  el.searchResults.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">Search</p><h3>搜索结果</h3></div><span class="count-pill">${matches.length}</span></div>`;
  if (!matches.length) {
    el.searchResults.insertAdjacentHTML("beforeend", `<div class="empty-state"><strong>没有匹配字段</strong><p>可以搜索 YAMLPath、字段名、脚本名、后端 ID 或中文说明。</p></div>`);
    return;
  }
  const list = document.createElement("div");
  list.className = "search-list";
  matches.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.path = node.path;
    button.className = "search-row";
    button.innerHTML = `<span><strong>${escapeHtml(node.key)}</strong><code title="${escapeHtml(node.path)}">${escapeHtml(node.path)}</code></span><em>${node.type}</em>`;
    list.append(button);
  });
  el.searchResults.append(list);
}

function viewIdForPath(path) {
  if (!path || path === "$") return "dashboard";
  const root = tokenize(path)[0];
  const matched = views.find((view) => view.roots.includes(root));
  return matched ? matched.id : "dashboard";
}

function render() {
  state.paths = state.config ? buildPaths(state.config) : [];
  renderChrome();
  renderNav();
  renderSearch();
  renderInspector();
  renderView();
  if (state.config && document.activeElement !== el.jsonEditor) {
    el.jsonEditor.value = JSON.stringify(state.config, null, 2);
  }
  window.requestAnimationFrame(updateScrollTools);
}

function panel(title, eyebrow, body, extra = "") {
  return `<section class="panel ${extra}"><div class="panel-heading"><div><p class="eyebrow">${eyebrow}</p><h3>${title}</h3></div></div>${body}</section>`;
}

function emptyState(title, text, action = "") {
  return `<div class="empty-state"><strong>${title}</strong><p>${text}</p>${action}</div>`;
}

function field(path, options = {}) {
  const value = getAt(state.config, path, options.default ?? "");
  const type = options.type || inferFieldType(path, value);
  const label = options.label || path.split(".").pop();
  const labelText = escapeHtml(label);
  const helper = options.helper ? `<small>${options.helper}</small>` : "";
  const help = helpTooltip(helpFor(path, options.helper || options.help || ""));
  const changed = state.dirtyPaths.has(path) ? " is-dirty" : "";
  const wide = options.wide ? " is-wide" : "";
  const risk = riskFor(path, value);
  let control = "";

  if (type === "switch") {
    control = `<label class="switch"><input type="checkbox" data-path="${path}" aria-label="${labelText}" ${value ? "checked" : ""}><span></span></label>`;
  } else if (type === "select") {
    const choices = options.allowUnset ? ["", ...(options.choices || [])] : (options.choices || []);
    control = `<select data-path="${path}" aria-label="${labelText}" ${options.allowUnset ? "data-unset-empty=\"true\"" : ""}>${choices.map((choice) => {
      const label = choice === "" ? (options.unsetLabel || "不覆盖") : choice;
      return `<option value="${escapeHtml(choice)}" ${String(value) === String(choice) ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("")}</select>`;
  } else if (type === "number") {
    control = `<input type="number" data-path="${path}" aria-label="${labelText}" value="${escapeHtml(value)}" min="${options.min ?? ""}" max="${options.max ?? ""}" step="${options.step ?? 1}">`;
  } else if (type === "presetText") {
    const presets = options.presets || [];
    const current = String(value ?? "");
    control = `<div class="text-preset-input">
      <input type="text" data-path="${path}" aria-label="${labelText}" value="${escapeHtml(current)}" placeholder="${escapeHtml(options.placeholder || "")}">
      <select data-preset-for="${path}" aria-label="${labelText} 预设选择">
        <option value="">选择预保留名称</option>
        ${presets.map((preset) => `<option value="${escapeHtml(preset.value)}" ${current === preset.value ? "selected" : ""}>${escapeHtml(preset.value)}${preset.description ? ` - ${escapeHtml(preset.description)}` : ""}</option>`).join("")}
      </select>
    </div>`;
  } else if (type === "json") {
    control = `<textarea class="json-field" data-path="${path}" data-json="true" aria-label="${labelText}" rows="${options.rows || 6}" spellcheck="false">${escapeHtml(JSON.stringify(value ?? {}, null, 2))}</textarea>`;
  } else if (type === "textarea") {
    control = `<textarea data-path="${path}" aria-label="${labelText}" rows="${options.rows || 4}" spellcheck="false">${escapeHtml(value ?? "")}</textarea>`;
  } else if (type === "secret") {
    control = `<span class="secret-input"><input type="${state.showSecrets ? "text" : "password"}" data-path="${path}" aria-label="${labelText}" value="${escapeHtml(value ?? "")}" autocomplete="off"><button class="icon-button" type="button" data-toggle-secrets aria-label="显示或隐藏密钥"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button></span>`;
  } else if (type === "color") {
    const color = hexPattern.test(String(value)) ? value : "#ffffff";
    control = `<div class="color-input"><input type="color" data-color-for="${path}" aria-label="${labelText} 色块" value="${escapeHtml(color.slice(0, 7))}"><input type="text" data-path="${path}" aria-label="${labelText}" value="${escapeHtml(value ?? "")}" placeholder="#78d5de"></div>`;
  } else {
    control = `<input type="${type === "url" ? "url" : "text"}" data-path="${path}" aria-label="${labelText}" value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(options.placeholder || "")}">`;
  }

  return `<div class="field ${changed}${wide}" data-field-path="${path}"><div class="field-meta"><span class="field-title"><strong>${labelText}</strong>${help}</span>${helper}${risk ? `<mark>${escapeHtml(risk)}</mark>` : ""}</div>${control}</div>`;
}

function inferFieldType(path, value) {
  if (typeof value === "boolean") return "switch";
  if (typeof value === "number") return "number";
  if (isSensitive(path)) return "secret";
  if (/url|proxy|address/i.test(path)) return "url";
  if (/color|value$/i.test(path) && hexPattern.test(String(value))) return "color";
  return "text";
}

function renderView() {
  if (!state.config) {
    el.viewStack.innerHTML = panel("加载配置", "Loading", `<div class="skeleton-list"><span></span><span></span><span></span></div>`);
    return;
  }
  const renderer = {
    dashboard: renderDashboard,
    basic: renderBasic,
    webapp: renderWebapp,
    bot: renderBot,
    network: renderNetwork,
    runtime: renderRuntime,
    scripts: renderScripts,
    slaves: renderSlaves,
    rules: renderRules,
    appearance: renderAppearance,
    translation: renderTranslation,
  }[state.activeView] || renderDashboard;
  el.viewStack.innerHTML = renderer();
}

function renderDashboard() {
  const rules = getAt(state.config, "$.rules", []);
  const slaves = getAt(state.config, "$.slaveConfig.slaves", []);
  const scripts = getAt(state.config, "$.scriptConfig.scripts", []);
  const webapp = getAt(state.config, "$.webapp", {});
  const isGenerator = state.backendMode === "local";
  const risks = [
    webapp.enable && !webapp.password ? "Web 面板已开启但未设置访问密码" : "",
    webapp.tls && (!webapp.tlsCertFile || !webapp.tlsKeyFile) ? "TLS 已开启但证书路径不完整" : "",
    !rules.length ? "rules 为空，测试入口不可用" : "",
    !slaves.length ? "未配置测速后端" : "",
  ].filter(Boolean);
  return `
    <section class="dashboard-grid">
      <article class="hero-panel">
        <p class="eyebrow">Control Surface</p>
        <h3>${isGenerator ? "Koipy config.yaml 生成器" : "草稿优先的 Koipy 配置台"}</h3>
        <p>${isGenerator ? "在浏览器里编辑配置模板，校验后导出 config.yaml；不会尝试操作真实后端。" : "所有修改先停留在浏览器草稿。校验通过后，可写入内存、保存到 config.yaml，或保存并触发重载。"}</p>
        <div class="hero-actions">
          <button class="button primary" type="button" data-command="validate">校验草稿</button>
          <button class="button accent" type="button" data-command="saveReload">${isGenerator ? "保存草稿" : "保存并重载"}</button>
        </div>
      </article>
      <article class="metric"><span>规则</span><strong>${rules.length}</strong><small>rules</small></article>
      <article class="metric"><span>后端</span><strong>${slaves.length}</strong><small>slaveConfig.slaves</small></article>
      <article class="metric"><span>脚本</span><strong>${scripts.length}</strong><small>scriptConfig.scripts</small></article>
    </section>
    ${panel("安全与变更摘要", "Ops Guard", `
      <div class="risk-list">${risks.length ? risks.map((risk) => `<button type="button" class="risk-item" data-path="$.webapp">${escapeHtml(risk)}</button>`).join("") : `<div class="success-state">当前未发现高优先级配置风险。</div>`}</div>
      <div class="change-list">${state.dirtyPaths.size ? [...state.dirtyPaths].map((path) => `<button type="button" class="change-item" data-path="${path}"><code>${path}</code><span>${escapeHtml(summarize(getAt(state.config, path), path))}</span></button>`).join("") : emptyState("暂无未保存修改", "编辑任意字段后会在这里显示变更路径。")}</div>
    `)}
  `;
}

function renderBasic() {
  return panel("基础与权限", "Identity", `
    <div class="form-grid">
      ${field("$.license", { label: "license", type: "secret", helper: "授权信息，默认隐藏。" })}
      ${field("$.log-level", { label: "log-level", type: "select", choices: ["DEBUG", "INFO", "WARNING", "ERROR"], helper: "运行日志等级。" })}
      ${arrayEditor("$.admin", "管理员 Telegram ID", "admin")}
      ${arrayEditor("$.user", "普通用户 Telegram ID", "user")}
    </div>
  `);
}

function renderWebapp() {
  return panel("Web 面板设置", "Web Console", `
    <div class="form-grid">
      ${field("$.webapp.enable", { label: "启用 Web 面板" })}
      ${field("$.webapp.address", { label: "监听地址", placeholder: "127.0.0.1:8899", helper: "建议使用 host:port，例如 127.0.0.1:8899。" })}
      ${field("$.webapp.password", { label: "访问密码", type: "secret", helper: "必填。请求会以 X-Access-Password 请求头发送。" })}
      ${field("$.webapp.tls", { label: "启用 TLS" })}
      ${field("$.webapp.tlsCertFile", { label: "TLS 证书文件", helper: "相对路径以 config.yaml 所在目录为基准。" })}
      ${field("$.webapp.tlsKeyFile", { label: "TLS 私钥文件", type: "secret" })}
      ${arrayEditor("$.webapp.allowOrigins", "允许跨域来源", "origin")}
    </div>
  `);
}

function renderBot() {
  return `
    ${panel("Telegram Bot", "Bot Core", `
      <div class="form-grid">
        ${field("$.bot.bot-token", { label: "bot-token", type: "secret" })}
        ${field("$.bot.api-id", { label: "api-id", type: "number", step: 1 })}
        ${field("$.bot.api-hash", { label: "api-hash", type: "secret" })}
        ${field("$.bot.proxy", { label: "Bot 代理", placeholder: "socks5://127.0.0.1:1080" })}
        ${field("$.bot.ipv6", { label: "IPv6" })}
        ${field("$.bot.antiGroup", { label: "防群组滥用" })}
        ${field("$.bot.strictMode", { label: "严格模式" })}
        ${field("$.bot.bypassMode", { label: "旁路模式" })}
        ${field("$.bot.parseMode", { label: "parseMode", type: "select", choices: ["DEFAULT", "MARKDOWN", "HTML", "DISABLED"] })}
        ${field("$.bot.cacheTime", { label: "cacheTime", type: "number", min: 0, step: 1 })}
        ${field("$.bot.echoLimit", { label: "echoLimit", type: "number", min: 0, step: 1 })}
        ${field("$.bot.autoResetCommands", { label: "自动重置命令" })}
        ${arrayEditor("$.bot.inviteGroup", "invite 群组白名单", "group id")}
        ${arrayEditor("$.bot.inviteBlacklistURL", "邀请测试 URL 黑名单源", "url")}
        ${arrayEditor("$.bot.inviteBlacklistDomain", "邀请测试域名黑名单源", "url")}
      </div>
    `)}
    ${panel("命令按钮", "Command Cards", commandCards())}
    ${panel("回调服务", "Callbacks", `
      <div class="form-grid one">
        ${field("$.callbacks.onMessage", { label: "onMessage", type: "textarea", rows: 5 })}
        ${field("$.callbacks.onPreSend", { label: "onPreSend", type: "textarea", rows: 5 })}
        ${field("$.callbacks.onResult", { label: "onResult", type: "textarea", rows: 5 })}
      </div>
    `)}
  `;
}

function renderNetwork() {
  return panel("网络与订阅转换", "Network Lab", `
    <div class="form-grid">
      ${field("$.network.httpProxy", { label: "HTTP Proxy" })}
      ${field("$.network.socks5Proxy", { label: "SOCKS5 Proxy" })}
      ${field("$.network.userAgent", { label: "User-Agent", type: "textarea", rows: 3 })}
      ${field("$.subconverter.enable", { label: "启用 subconverter" })}
      ${field("$.subconverter.mode", { label: "模式", type: "select", choices: ["subconverter", "substore"] })}
      ${field("$.subconverter.template.backend", { label: "后端模板 URL" })}
      ${field("$.subconverter.defaults.target", { label: "默认 target" })}
    </div>
  `);
}

function runtimeFields(base, options = {}) {
  const speedFilesTitle = options.speedFilesTitle || "测速文件";
  const labelPrefix = options.labelPrefix || "";
  const switchDefault = options.optional ? false : undefined;
  const switchOptions = (extra = {}) => ({
    type: "switch",
    ...(switchDefault === undefined ? {} : { default: switchDefault }),
    ...extra,
  });
  return `
    ${field(`${base}.entrance`, { label: `${labelPrefix}入口检测`, ...switchOptions() })}
    ${field(`${base}.duration`, { label: `${labelPrefix}下载时长`, type: "number", min: 1, max: 120, step: 1 })}
    ${field(`${base}.ipstack`, { label: `${labelPrefix}IP 栈检测`, ...switchOptions() })}
    ${field(`${base}.localip`, { label: `${labelPrefix}localip`, ...switchOptions() })}
    ${field(`${base}.nospeed`, { label: `${labelPrefix}nospeed`, ...switchOptions() })}
    ${field(`${base}.pingURL`, { label: `${labelPrefix}Ping URL` })}
    ${arrayEditor(`${base}.speedFiles`, speedFilesTitle, "url")}
    ${field(`${base}.speedNodes`, { label: `${labelPrefix}测速节点数`, type: "number", min: 1, max: 2000, step: 1 })}
    ${field(`${base}.speedThreads`, { label: `${labelPrefix}测速线程`, type: "number", min: 1, max: 64, step: 1 })}
    ${field(`${base}.includeFilter`, { label: `${labelPrefix}包含过滤` })}
    ${field(`${base}.excludeFilter`, { label: `${labelPrefix}排除过滤` })}
    ${field(`${base}.sort`, { label: `${labelPrefix}排序`, type: "select", choices: ["订阅原序", "HTTP升序", "HTTP降序", "平均速度升序", "平均速度降序", "最大速度升序", "最大速度降序", "RTT升序", "RTT降序"], allowUnset: options.optional })}
    ${field(`${base}.output`, { label: `${labelPrefix}输出模式`, type: "select", choices: ["image", "json", "video"], allowUnset: options.optional })}
    ${field(`${base}.realtime`, { label: `${labelPrefix}实时输出`, ...switchOptions() })}
    ${field(`${base}.disableSubCvt`, { label: `${labelPrefix}禁用订阅转换`, ...switchOptions() })}
    ${field(`${base}.protectContent`, { label: `${labelPrefix}保护内容`, ...switchOptions() })}
    ${field(`${base}.enableDNSInject`, { label: `${labelPrefix}DNS 注入`, ...switchOptions() })}
  `;
}

function renderRuntime() {
  return panel("测试运行时", "Runtime", `
    <div class="form-grid">
      ${runtimeFields("$.runtime")}
    </div>
  `);
}

function renderScripts() {
  const scripts = getAt(state.config, "$.scriptConfig.scripts", []);
  return panel("脚本配置", "Script Registry", `
    <div class="toolbar-line">
      <button class="button secondary" type="button" data-add-script>新增脚本</button>
      <span>${scripts.length} 个脚本，按 rank 升序维护。</span>
      ${arrayControls("$.scriptConfig.scripts", scripts.length)}
    </div>
    <div class="card-list">${scripts.length ? scripts.map(scriptCard).join("") : emptyState("暂无脚本", "添加 gojajs 或自定义脚本后，可在 rules 中选择。", `<button class="button secondary" type="button" data-add-script>新增脚本</button>`)}</div>
  `);
}

function renderSlaves() {
  const cfg = getAt(state.config, "$.slaveConfig", {});
  const slaves = cfg.slaves || [];
  return `
    ${panel("后端全局设置", "Slave Control", `
      <div class="form-grid">
        ${field("$.slaveConfig.geoClustering", { label: "地理聚类" })}
        ${field("$.slaveConfig.showID", { label: "显示后端 ID" })}
        ${field("$.slaveConfig.speedScheduling", { label: "测速调度" })}
        ${field("$.slaveConfig.healthCheck.autoHideOnFailure", { label: "失败自动隐藏" })}
        ${field("$.slaveConfig.healthCheck.numSamples", { label: "健康检查样本", type: "number", min: 1, max: 20, step: 1 })}
        ${field("$.slaveConfig.healthCheck.showStatusStyle", { label: "状态展示", type: "select", choices: ["emoji", "number", "default"] })}
      </div>
    `)}
    ${panel("后端节点", "Slave Cards", `
      <div class="toolbar-line"><button class="button secondary" type="button" data-add-slave>新增后端</button><span>${slaves.length} 个后端</span>${arrayControls("$.slaveConfig.slaves", slaves.length)}</div>
      <div class="card-list">${slaves.length ? slaves.map(slaveCard).join("") : emptyState("暂无后端", "添加 miaospeed 或 fulltclash/websocket 后端。", `<button class="button secondary" type="button" data-add-slave>新增后端</button>`)}</div>
    `)}
  `;
}

function renderRules() {
  const rules = getAt(state.config, "$.rules", []);
  return panel("测试规则", "Rules", `
    <div class="toolbar-line">
      <button class="button secondary" type="button" data-add-rule>新增规则</button>
      <button class="button danger" type="button" data-clear-rules>清空 rules</button>
      <span>${rules.length} 条规则，所有变更先进入草稿。</span>
      ${arrayControls("$.rules", rules.length)}
    </div>
    <div class="card-list">${rules.length ? rules.map(ruleCard).join("") : emptyState("暂无规则", "规则用于把命令、订阅 URL、后端和脚本组合成测试任务。", `<button class="button secondary" type="button" data-add-rule>新增规则</button>`)}</div>
  `);
}

function renderAppearance() {
  return `
    ${panel("图片与外观", "Image", `
      <div class="form-grid">
        ${field("$.image.title", { label: "标题" })}
        ${field("$.image.logo", { label: "协议Logo" })}
        ${field("$.image.speedFormat", { label: "速度格式" })}
        ${field("$.image.pixelThreshold", { label: "像素阈值", type: "number", min: 0, step: 1 })}
        ${field("$.image.font", { label: "字体文件" })}
        ${field("$.image.emoji.enable", { label: "启用 emoji", type: "switch", default: false })}
        ${field("$.image.emoji.source", { label: "emoji 来源" })}
        ${field("$.image.endColorsSwitch", { label: "渐变开关", type: "switch", default: false })}
        ${field("$.image.speedEndColorSwitch", { label: "速度渐变开关", type: "switch", default: false })}
        ${field("$.image.compress", { label: "压缩图片" })}
        ${field("$.image.invert", { label: "反色" })}
        ${field("$.image.save", { label: "保存结果图" })}
        ${field("$.image.watermark.enable", { label: "启用水印" })}
        ${field("$.image.watermark.text", { label: "水印内容" })}
        ${field("$.image.watermark.alpha", { label: "水印透明度", type: "number", min: 0, max: 255, step: 1 })}
        ${field("$.image.watermark.angle", { label: "水印角度", type: "number", min: -180, max: 180, step: 1 })}
        ${field("$.image.watermark.size", { label: "水印大小", type: "number", min: 1, step: 1 })}
        ${field("$.image.watermark.row-spacing", { label: "水印行距", type: "number", min: 0, step: 1 })}
        ${field("$.image.watermark.start-y", { label: "开始 Y 坐标", type: "number", min: 0, step: 1 })}
        ${field("$.image.watermark.trace", { label: "UID 追踪" })}
        ${field("$.image.watermark.shadow", { label: "隐水印" })}
        ${field("$.image.watermark.color.value", { label: "水印颜色", type: "color" })}
      </div>
    `)}
    ${panel("速度 / 延迟渐变色", "Color Graph", colorPreview())}
  `;
}

function renderTranslation() {
  const resources = getAt(state.config, "$.translation.resources", {});
  const resourceKeys = resources && typeof resources === "object" && !Array.isArray(resources)
    ? Object.keys(resources).filter(Boolean)
    : [];
  const currentLang = getAt(state.config, "$.translation.lang", "");
  const langChoices = [...new Set([currentLang, ...resourceKeys].filter(Boolean))];
  return panel("本地化配置", "Localization", `
    <div class="form-grid">
      ${field("$.translation.lang", {
        label: "语言",
        type: "select",
        choices: langChoices.length ? langChoices : ["zh-CN"],
        helper: "候选项来自下方语言资源键。先新增资源键，再在这里选择启用语言。",
      })}
      ${resourceEditor("$.translation.resources", "语言资源")}
    </div>
  `);
}

function resourceEditor(path, title) {
  const resources = getAt(state.config, path, {});
  const entries = resources && typeof resources === "object" && !Array.isArray(resources)
    ? Object.entries(resources)
    : [];
  return `<div class="resource-editor" data-resource-path="${path}">
    <div class="array-heading">
      <span class="field-title"><strong>${title}</strong>${helpTooltip(helpFor(path))}</span>
      <button class="button secondary" type="button" data-resource-add="${path}">新增语言资源</button>
    </div>
    <div class="resource-list">${entries.length ? entries.map(([key, value], index) => `
      <div class="resource-row">
        <input type="text" data-resource-key="${path}" data-index="${index}" value="${escapeHtml(key)}" aria-label="语言资源键" placeholder="zh-CN">
        <input type="text" data-resource-value="${path}" data-index="${index}" value="${escapeHtml(value ?? "")}" aria-label="语言资源路径" placeholder="./resources/i18n/zh-CN.yml">
        <button class="icon-button danger" type="button" data-resource-del="${path}" data-index="${index}" aria-label="删除语言资源"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg></button>
      </div>`).join("") : `<p class="muted">暂无语言资源。点击新增后填写语言键和 YAML 路径。</p>`}</div>
  </div>`;
}

function arrayEditor(path, title, itemName) {
  const arr = getAt(state.config, path, []);
  const help = helpTooltip(helpFor(path));
  const items = Array.isArray(arr) ? arr : [];
  return `<div class="array-editor" data-array-path="${path}">
    <div class="array-heading">
      <span class="field-title"><strong>${title}</strong>${help}</span>
      <span class="array-heading-actions">${arrayControls(path, items.length)}<button class="button secondary" type="button" data-array-add="${path}">新增</button></span>
    </div>
    <div class="array-list">${items.length ? items.map((item, index) => {
      const expanded = isArrayExpanded(path, index, items.length);
      const summary = arrayItemSummary(item, index, itemName);
      return `<article class="array-item ${expanded ? "is-expanded" : ""}">
        <div class="array-summary">
          <span><strong>${escapeHtml(summary.label)}</strong><small>${escapeHtml(summary.detail)}</small></span>
          <button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button>
        </div>
        ${expanded ? `<div class="array-row">
          <input type="text" data-array-item="${path}" data-index="${index}" value="${escapeHtml(item ?? "")}" placeholder="${itemName}">
          <button class="icon-button" type="button" data-array-up="${path}" data-index="${index}" aria-label="上移"><svg viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"></path></svg></button>
          <button class="icon-button" type="button" data-array-copy="${path}" data-index="${index}" aria-label="复制"><svg viewBox="0 0 24 24"><path d="M8 8h10v12H8z"></path><path d="M6 16H4V4h12v2"></path></svg></button>
          <button class="icon-button danger" type="button" data-array-del="${path}" data-index="${index}" aria-label="删除"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg></button>
        </div>` : ""}
      </article>`;
    }).join("") : `<p class="muted">暂无 ${title}</p>`}</div>
  </div>`;
}

function commandCards() {
  const commands = getAt(state.config, "$.bot.commands", []);
  const path = "$.bot.commands";
  return `<div class="toolbar-line"><button class="button secondary" type="button" data-add-command>新增命令</button><span>${commands.length} 个命令</span>${arrayControls(path, commands.length)}</div>
  <div class="card-list">${commands.map((cmd, index) => {
    const expanded = isArrayExpanded(path, index, commands.length);
    return `<article class="item-card ${expanded ? "is-expanded" : ""}">
      <header>
        <div class="card-summary">
          <span><strong>/${escapeHtml(cmd.name || `command-${index + 1}`)}</strong><small>${escapeHtml(cmd.title || "未命名命令")}</small></span>
          <button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button>
        </div>
        <span class="card-header-actions">${miniSwitch(`$.bot.commands[${index}].enable`, cmd.enable !== false)}</span>
      </header>
      ${expanded ? `<div class="compact-grid">
          ${field(`$.bot.commands[${index}].name`, { label: "name" })}
          ${field(`$.bot.commands[${index}].rule`, { label: "rule" })}
          ${field(`$.bot.commands[${index}].title`, { label: "title" })}
          ${field(`$.bot.commands[${index}].text`, { label: "text" })}
          ${field(`$.bot.commands[${index}].pin`, { label: "pin" })}
          ${field(`$.bot.commands[${index}].attachToInvite`, { label: "attachToInvite" })}
        </div>
        <footer>${cardActions(path, index)}</footer>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function scriptCard(script, index) {
  const path = "$.scriptConfig.scripts";
  const scripts = getAt(state.config, path, []);
  const expanded = isArrayExpanded(path, index, scripts.length);
  return `<article class="item-card ${expanded ? "is-expanded" : ""}">
    <header>
      <div class="card-summary">
        <span><strong>${escapeHtml(script.name || `script-${index + 1}`)}</strong><small>${escapeHtml(script.content || "未设置内容")}</small></span>
        <button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button>
      </div>
      <span class="type-badge">${escapeHtml(script.type || "script")}</span>
    </header>
    ${expanded ? `<div class="compact-grid">
        ${field(`$.scriptConfig.scripts[${index}].name`, { label: "name", type: "presetText", presets: SCRIPT_RESERVED_NAMES, placeholder: "脚本名或预保留名称", wide: true })}
        ${field(`$.scriptConfig.scripts[${index}].type`, { label: "type", type: "select", choices: ["gojajs", "gofunc"] })}
        ${field(`$.scriptConfig.scripts[${index}].rank`, { label: "rank", type: "number", step: 1 })}
        ${field(`$.scriptConfig.scripts[${index}].content`, { label: "content", type: "textarea", rows: String(script.content || "").includes("\n") ? 10 : 3, helper: "可以是脚本源码，也可以是文件路径。" })}
      </div>
      <footer>${cardActions(path, index)}</footer>` : ""}
  </article>`;
}

function slaveCard(slave, index) {
  const base = `$.slaveConfig.slaves[${index}]`;
  const path = "$.slaveConfig.slaves";
  const slaves = getAt(state.config, path, []);
  const expanded = isArrayExpanded(path, index, slaves.length);
  return `<article class="item-card ${expanded ? "is-expanded" : ""}">
    <header>
      <div class="card-summary">
        <span><strong>${escapeHtml(slave.id || `slave-${index + 1}`)}</strong><small>${escapeHtml(slave.comment || slave.address || "未填写地址")}</small></span>
        <button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button>
      </div>
      <span class="type-badge">${escapeHtml(slave.type || "miaospeed")}</span>
    </header>
    ${expanded ? `<div class="compact-grid">
        ${field(`${base}.id`, { label: "id" })}
        ${field(`${base}.type`, { label: "type", type: "select", choices: ["miaospeed", "fulltclash", "websocket"] })}
        ${field(`${base}.address`, { label: "address", placeholder: "127.0.0.1:8765" })}
        ${field(`${base}.path`, { label: "path" })}
        ${field(`${base}.token`, { label: "token", type: "secret" })}
        ${field(`${base}.invoker`, { label: "invoker" })}
        ${field(`${base}.buildtoken`, { label: "buildtoken", type: "secret" })}
        ${field(`${base}.tls`, { label: "TLS" })}
        ${field(`${base}.skipCertVerify`, { label: "跳过证书校验" })}
        ${field(`${base}.hidden`, { label: "隐藏" })}
        ${field(`${base}.comment`, { label: "备注" })}
        ${field(`${base}.option.downloadDuration`, { label: "下载时长", type: "number", min: 1, step: 1 })}
        ${field(`${base}.option.downloadThreading`, { label: "下载线程", type: "number", min: 1, step: 1 })}
        ${field(`${base}.option.downloadURL`, { label: "下载 URL" })}
        ${field(`${base}.option.pingAddress`, { label: "Ping 地址" })}
        ${field(`${base}.option.pingAverageOver`, { label: "Ping 平均次数", type: "number", min: 1, step: 1 })}
        ${field(`${base}.option.stunURL`, { label: "STUN URL" })}
        ${field(`${base}.option.taskRetry`, { label: "重试次数", type: "number", min: 0, step: 1 })}
        ${field(`${base}.option.taskTimeout`, { label: "超时 ms", type: "number", min: 100, step: 100 })}
        ${field(`${base}.option.apiVersion`, { label: "API Version", type: "number", min: 1, step: 1 })}
        ${field(`${base}.option.uploadURL`, { label: "上传 URL" })}
        ${field(`${base}.option.uploadDuration`, { label: "上传时长", type: "number", min: 1, step: 1 })}
        ${field(`${base}.option.uploadThreading`, { label: "上传线程", type: "number", min: 1, step: 1 })}
      </div>
      ${arrayEditor(`${base}.option.dnsServer`, "DNS Server", "dns")}
      <footer>${cardActions(path, index)}</footer>` : ""}
  </article>`;
}

function ruleCard(rule, index) {
  const base = `$.rules[${index}]`;
  const slaves = getAt(state.config, "$.slaveConfig.slaves", []).map((slave) => slave.id).filter(Boolean);
  const scripts = getAt(state.config, "$.scriptConfig.scripts", []).map((script) => script.name).filter(Boolean);
  const path = "$.rules";
  const rules = getAt(state.config, path, []);
  const expanded = isArrayExpanded(path, index, rules.length);
  return `<article class="item-card ${expanded ? "is-expanded" : ""}">
    <header>
      <div class="card-summary">
        <span><strong>${escapeHtml(rule.name || `rule-${index + 1}`)}</strong><small>${escapeHtml(rule.url || "未设置订阅 URL")}</small></span>
        <button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button>
      </div>
      <span class="type-badge">rule</span>
    </header>
    ${expanded ? `<div class="compact-grid">
        ${field(`${base}.name`, { label: "name" })}
        ${field(`${base}.url`, { label: "订阅 URL" })}
        ${field(`${base}.owner`, { label: "owner", type: "number", step: 1 })}
        ${tagEditor(`${base}.slaveid`, "选择后端", slaves)}
        ${tagEditor(`${base}.script`, "选择脚本", scripts)}
        ${runtimeFields(`${base}.runtime`, { optional: true, labelPrefix: "覆盖 ", speedFilesTitle: "规则测速文件" })}
      </div>
      <footer>${cardActions(path, index)}</footer>` : ""}
  </article>`;
}

function tagEditor(path, title, choices) {
  const selected = getAt(state.config, path, []);
  const help = helpTooltip(helpFor(path));
  return `<div class="tag-editor" data-tag-path="${path}"><span class="field-title"><strong>${title}</strong>${help}</span><div class="tag-cloud">${choices.length ? choices.map((choice) => `
    <label><input type="checkbox" data-tag-choice="${path}" value="${escapeHtml(choice)}" ${selected.includes(choice) ? "checked" : ""}><span>${escapeHtml(choice)}</span></label>`).join("") : `<small>暂无可选项</small>`}</div></div>`;
}

function miniSwitch(path, value) {
  return `<span class="switch-with-help">${helpTooltip(helpFor(path))}<label class="switch"><input type="checkbox" data-path="${path}" ${value ? "checked" : ""}><span></span></label></span>`;
}

function cardActions(arrayPath, index) {
  return `<button class="button secondary" type="button" data-card-up="${arrayPath}" data-index="${index}">上移</button>
    <button class="button secondary" type="button" data-card-copy="${arrayPath}" data-index="${index}">复制</button>
    <button class="button danger" type="button" data-card-del="${arrayPath}" data-index="${index}">删除</button>`;
}

function colorPreview() {
  const speed = getAt(state.config, "$.image.color.speed", []);
  const delay = getAt(state.config, "$.image.color.delay", []);
  const background = getAt(state.config, "$.image.color.background", {});
  const swatches = Object.entries(background).slice(0, 10).map(([name, cfg]) => field(`$.image.color.background.${name}.value`, { label: name, type: "color" })).join("");
  return `<div class="gradient-preview"><div style="background:${gradient(speed)}"></div><span>速度色带</span></div>
    ${colorStopEditor("$.image.color.speed", "速度色带断点", "MB/s")}
    <div class="gradient-preview"><div style="background:${gradient(delay)}"></div><span>延迟色带</span></div>
    ${colorStopEditor("$.image.color.delay", "延迟色带断点", "ms")}
    <div class="watermark-preview"><strong>${escapeHtml(getAt(state.config, "$.image.title", "Koipy"))}</strong><span>${escapeHtml(getAt(state.config, "$.image.watermark.text", "watermark") || "watermark preview")}</span></div>
    <div class="form-grid">${swatches}</div>`;
}

function colorStopEditor(path, title, unit) {
  const stops = getAt(state.config, path, []);
  const items = Array.isArray(stops) ? stops : [];
  const randomTool = ["$.image.color.speed", "$.image.color.delay"].includes(path)
    ? `<button class="button secondary tool-button" type="button" data-color-random-open="${path}">随机生成</button>`
    : "";
  return `<div class="color-stop-editor" data-color-stop-path="${path}">
    <div class="array-heading">
      <span class="field-title"><strong>${title}</strong>${helpTooltip(helpFor(path))}</span>
      <span class="array-heading-actions">${arrayControls(path, items.length)}${randomTool}<button class="button secondary" type="button" data-color-stop-add="${path}">新增断点</button></span>
    </div>
    <div class="color-stop-list">${items.length ? items.map((stop, index) => {
      const expanded = isArrayExpanded(path, index, items.length);
      const color = hexPattern.test(String(stop?.value || "")) ? stop.value : "#ffffff";
      return `<article class="color-stop ${expanded ? "is-expanded" : ""}">
        <div class="array-summary">
          <span><strong>${escapeHtml(String(stop?.label ?? index))} ${escapeHtml(unit)}</strong><small>${escapeHtml(stop?.name || stop?.value || "未命名断点")}</small></span>
          <span class="color-stop-actions"><i style="background:${escapeHtml(color)}"></i><button class="ghost-chip" type="button" data-array-toggle="${path}" data-index="${index}" aria-expanded="${expanded}">${expanded ? "收起" : "展开"}</button></span>
        </div>
        ${expanded ? `<div class="color-stop-grid">
          ${field(`${path}[${index}].label`, { label: "label", type: "number", step: "any" })}
          ${field(`${path}[${index}].name`, { label: "name" })}
          ${field(`${path}[${index}].value`, { label: "value", type: "color" })}
          ${field(`${path}[${index}].alpha`, { label: "alpha", type: "number", min: 0, max: 255, step: 1 })}
          ${field(`${path}[${index}].end_color`, { label: "end_color", type: "color" })}
          <footer class="color-stop-footer">
            <button class="button secondary" type="button" data-card-up="${path}" data-index="${index}">上移</button>
            <button class="button secondary" type="button" data-card-copy="${path}" data-index="${index}">复制</button>
            <button class="button danger" type="button" data-card-del="${path}" data-index="${index}">删除</button>
          </footer>
        </div>` : ""}
      </article>`;
    }).join("") : `<p class="muted">暂无${title}。点击新增断点后配置阈值和颜色。</p>`}</div>
  </div>`;
}

function gradient(list) {
  if (!Array.isArray(list) || !list.length) return "linear-gradient(90deg,#8d8b8e,#78d5de,#ff477e)";
  return `linear-gradient(90deg, ${list.map((item, index) => `${item.value || "#ffffff"} ${(index / Math.max(list.length - 1, 1)) * 100}%`).join(",")})`;
}

function readInputValue(input) {
  const current = getAt(state.config, input.dataset.path);
  if (input.dataset.json === "true") {
    return JSON.parse(input.value || "{}");
  }
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") {
    const value = Number(input.value);
    if (!Number.isFinite(value)) throw new Error("数字格式无效");
    return Number.isInteger(current) ? Math.trunc(value) : value;
  }
  if (input.type === "url" && input.value && !urlPattern.test(input.value)) {
    input.setCustomValidity("请输入 http(s)、socks5、ws(s) 或 udp URL");
    input.reportValidity();
    throw new Error("URL 格式不正确");
  }
  input.setCustomValidity("");
  return input.value;
}

async function loadConfig(options = {}) {
  const discardColdSample = options && options.discardColdSample === true;
  const loadLocal = ({ cause = null, announce = true } = {}) => {
    const localConfig = readLocalConfig();
    state.config = localConfig;
    state.original = clone(localConfig);
    state.dirtyPaths.clear();
    state.validation = "idle";
    state.health = "local";
    state.backendMode = "local";
    state.healthLatencyMs = 0;
    state.lastSyncAt = new Date();
    state.selectedPath = "$";
    render();
    if (!announce) return;
    if (cause) {
      toast("已切回配置生成器", `真实 API 暂不可用：${readableConnectionError(cause)}`, "warning");
    } else {
      toast("配置生成器已就绪", "已载入 config.example.yaml 模板，可直接编辑并导出 config.yaml。");
    }
  };
  if (shouldUseGeneratorMode() || (state.backendMode === "local" && !state.apiBase)) {
    loadLocal({ announce: !options.initial });
    return;
  }
  try {
    state.backendMode = "remote";
    state.health = "pending";
    state.healthLatencyMs = null;
    renderChrome();
    const measureHealthLatency = async () => {
      const healthStart = performance.now();
      await api("/api/health");
      return Math.max(0, Math.round(performance.now() - healthStart));
    };
    let latencyMs = await measureHealthLatency();
    // For cold start, warm up once and use the second sample.
    if (discardColdSample && !state.healthLatencyPrimed) {
      state.healthLatencyPrimed = true;
      latencyMs = await measureHealthLatency();
    } else {
      state.healthLatencyPrimed = true;
    }
    state.healthLatencyMs = latencyMs;
    const data = await api("/api/config");
    state.config = data.config;
    state.original = clone(data.config);
    state.dirtyPaths.clear();
    state.validation = "idle";
    state.health = "online";
    state.lastSyncAt = new Date();
    state.selectedPath = "$";
    render();
    toast("配置已加载", "已从 Koipy 运行态读取完整配置。");
  } catch (error) {
    loadLocal({ cause: error, announce: true });
  }
}

async function validateDraft() {
  if (!state.config) return;
  try {
    await api("/api/config/validate", { method: "POST", body: { config: state.config } });
    state.validation = "pass";
    renderChrome();
    toast("校验通过", state.backendMode === "local" ? "当前 config.yaml 草稿已通过本地结构检查。" : "当前草稿可被 Koipy 配置模型接受。");
    return true;
  } catch (error) {
    state.validation = "fail";
    renderChrome();
    toast("校验失败", error.message, "error");
    return false;
  }
}

async function putDraft(quiet = false) {
  if (!state.config) return false;
  const data = await api("/api/config", { method: "PUT", body: { config: state.config } });
  state.config = data.config;
  state.original = clone(data.config);
  state.dirtyPaths.clear();
  state.validation = "pass";
  state.lastSyncAt = new Date();
  render();
  if (!quiet) toast(state.backendMode === "local" ? "草稿已保存" : "已写入内存", state.backendMode === "local" ? "配置已保存到当前浏览器，可继续编辑或导出 config.yaml。" : "配置已更新到运行态，尚未必然保存到 config.yaml。");
  return true;
}

async function applyMode(mode) {
  await api("/api/config/apply", { method: "POST", body: { mode } });
}

async function saveWithMode(mode) {
  try {
    if (state.validation !== "pass") {
      const ok = await validateDraft();
      if (!ok) return;
    }
    if (state.dirtyPaths.size) await putDraft(true);
    await applyMode(mode);
    const local = state.backendMode === "local";
    const title = local ? "草稿已保存" : (mode === "save" ? "保存成功" : "保存并重载成功");
    const message = local
      ? "配置已保存到当前浏览器。导出 YAML 后可作为 Koipy config.yaml 使用。"
      : (mode === "save" ? "config.yaml 已写入。" : "config.yaml 已写入并重新加载。");
    toast(title, message);
  } catch (error) {
    toast("保存失败", error.message, "error");
  }
}

async function exportYaml() {
  try {
    const text = await apiText("/api/config/export");
    el.yamlEditor.value = text;
    const blob = new Blob([text], { type: "application/x-yaml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "config.yaml";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast("导出 YAML", state.backendMode === "local" ? "已从生成器草稿导出 config.yaml。" : "已生成 config.yaml。");
  } catch (error) {
    toast("导出失败", error.message, "error");
  }
}

async function refreshYaml() {
  try {
    el.yamlEditor.value = await apiText("/api/config/export");
    toast("YAML 已刷新", state.backendMode === "local" ? "预览来自 config.yaml 生成器草稿。" : "预览来自后端当前运行态。");
  } catch (error) {
    toast("YAML 刷新失败", error.message, "error");
  }
}

function resourceMap(path) {
  const resources = getAt(state.config, path, {});
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) return {};
  return clone(resources);
}

function uniqueResourceKey(resources, base = "new-lang") {
  if (!Object.prototype.hasOwnProperty.call(resources, base)) return base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(resources, `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function addResource(path) {
  const resources = resourceMap(path);
  const base = Object.keys(resources).length ? "new-lang" : "zh-CN";
  const key = uniqueResourceKey(resources, base);
  const value = key === "zh-CN" ? "./resources/i18n/zh-CN.yml" : `./resources/i18n/${key}.yml`;
  resources[key] = value;
  update(path, resources, { select: `${path}.${key}`, keepScroll: true });
}

function changeResourceKey(path, index, keyValue) {
  const entries = Object.entries(resourceMap(path));
  const current = entries[index];
  if (!current) return;
  const oldKey = current[0];
  const newKey = keyValue.trim();
  if (!newKey) {
    toast("语言资源键不能为空", "请填写如 zh-CN、en-us 这样的资源键。", "warning");
    renderPreservingScroll();
    return;
  }
  if (newKey !== oldKey && entries.some(([key]) => key === newKey)) {
    toast("语言资源键重复", `${newKey} 已存在，请换一个键名。`, "warning");
    renderPreservingScroll();
    return;
  }
  const next = {};
  entries.forEach(([key, value], itemIndex) => {
    next[itemIndex === index ? newKey : key] = value;
  });
  update(path, next, { select: `${path}.${newKey}`, keepScroll: true });
  if (path === "$.translation.resources" && getAt(state.config, "$.translation.lang") === oldKey) {
    update("$.translation.lang", newKey, { select: "$.translation.lang", keepScroll: true });
  }
}

function changeResourceValue(path, index, value) {
  const entries = Object.entries(resourceMap(path));
  const current = entries[index];
  if (!current) return;
  const [key] = current;
  const next = {};
  entries.forEach(([entryKey, entryValue], itemIndex) => {
    next[entryKey] = itemIndex === index ? value.trim() : entryValue;
  });
  update(path, next, { select: `${path}.${key}`, keepScroll: true });
}

function removeResource(path, index) {
  const entries = Object.entries(resourceMap(path));
  const current = entries[index];
  if (!current) return;
  const next = {};
  entries.forEach(([key, value], itemIndex) => {
    if (itemIndex !== index) next[key] = value;
  });
  update(path, next, { select: path, keepScroll: true });
}

function defaultColorStop(path) {
  if (path.endsWith(".delay")) {
    return { label: 100, name: "自定义延迟", value: "#78d5de", alpha: 255, end_color: "#ffffff" };
  }
  return { label: 0, name: "自定义速度", value: "#ff7096", alpha: 255, end_color: "#ffffff" };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function hslToHex(hue, saturation, lightness) {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"));
  return `#${rgb.join("")}`;
}

function colorToolMeta(path) {
  if (path.endsWith(".delay")) {
    return {
      title: "随机生成延迟色带",
      eyebrow: "Delay Color Tool",
      unit: "ms",
      toast: "延迟色带已生成",
      helpPath: "$.image.color.delay",
      helper: "随机选择一组起止色，并按 HSL 渐变生成连续色带。阈值按 1-2000 ms 的曲线分布，生成后仍可逐项手动调整。",
    };
  }
  return {
    title: "随机生成速度色带",
    eyebrow: "Speed Color Tool",
    unit: "MB/s",
    toast: "速度色带已生成",
    helpPath: "$.image.color.speed",
    helper: "随机选择一组起止色，并按 HSL 渐变生成连续色带。阈值按 25 MB/s 步长分布，生成后仍可逐项手动调整。",
  };
}

function colorStopLabel(path, index, count) {
  if (path.endsWith(".delay")) {
    const ratio = count <= 1 ? 0 : index / (count - 1);
    return Math.round(lerp(1, 2000, ratio * ratio));
  }
  return Number((index * 25).toFixed(1));
}

function colorGradientStops(path, count) {
  const safeCount = Math.max(2, Math.min(64, Math.trunc(Number(count)) || 10));
  const hueStart = randomInt(150, 220);
  const hueSpan = randomInt(70, 170) * (Math.random() > 0.45 ? 1 : -1);
  const saturationStart = randomInt(48, 68);
  const saturationEnd = randomInt(74, 92);
  const lightStart = randomInt(88, 94);
  const lightEnd = randomInt(46, 58);
  return Array.from({ length: safeCount }, (_, index) => {
    const ratio = safeCount === 1 ? 0 : index / (safeCount - 1);
    const eased = ratio * ratio * (3 - 2 * ratio);
    const value = hslToHex(
      hueStart + hueSpan * eased,
      lerp(saturationStart, saturationEnd, eased),
      lerp(lightStart, lightEnd, eased),
    );
    return {
      label: colorStopLabel(path, index, safeCount),
      name: String(index + 1),
      value,
      alpha: 255,
      end_color: "#ffffff",
    };
  });
}

function colorRandomPreview(stops) {
  return `<div class="tool-preview-gradient" style="background:${gradient(stops)}"></div>
    <div class="tool-preview-stops">${stops.map((stop) => `
      <span><i style="background:${escapeHtml(stop.value)}"></i><code>${escapeHtml(stop.label)}</code></span>
    `).join("")}</div>`;
}

function openColorGradientTool(path) {
  const meta = colorToolMeta(path);
  let previewStops = colorGradientStops(path, 10);
  el.modalHost.innerHTML = `
    <div class="modal-backdrop">
      <section class="tool-modal" role="dialog" aria-modal="true" aria-labelledby="color-tool-title">
        <p class="eyebrow">${escapeHtml(meta.eyebrow)}</p>
        <h3 id="color-tool-title">${escapeHtml(meta.title)}</h3>
        <p class="tool-helper">${escapeHtml(meta.helper)}</p>
        <form data-color-random-form>
          <label class="field">
            <span class="field-title"><strong>断点数量</strong>${helpTooltip(`生成多少个 ${meta.helpPath} 断点。默认 10，建议 5-20；过多会让图例和调色维护变复杂。`)}</span>
            <input type="number" data-color-random-count value="10" min="2" max="64" step="1" inputmode="numeric">
          </label>
          <div class="tool-preview" data-color-random-preview></div>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-color-random-refresh>换一组预览</button>
            <button class="button secondary" type="button" data-result="cancel">取消</button>
            <button class="button primary" type="submit">生成并替换</button>
          </div>
        </form>
      </section>
    </div>`;

  const backdrop = el.modalHost.querySelector(".modal-backdrop");
  const form = el.modalHost.querySelector("[data-color-random-form]");
  const countInput = el.modalHost.querySelector("[data-color-random-count]");
  const preview = el.modalHost.querySelector("[data-color-random-preview]");
  const refresh = el.modalHost.querySelector("[data-color-random-refresh]");

  const countValue = () => Math.max(2, Math.min(64, Math.trunc(Number(countInput.value)) || 10));
  const renderPreview = () => {
    preview.innerHTML = colorRandomPreview(previewStops);
  };
  const regenerate = () => {
    const count = countValue();
    countInput.value = String(count);
    previewStops = colorGradientStops(path, count);
    renderPreview();
  };

  renderPreview();
  countInput.addEventListener("change", regenerate);
  refresh.addEventListener("click", regenerate);
  backdrop.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-result]");
    if (!button && event.target !== event.currentTarget) return;
    el.modalHost.innerHTML = "";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const count = countValue();
    countInput.value = String(count);
    if (!countInput.checkValidity()) {
      countInput.reportValidity();
      return;
    }
    if (previewStops.length !== count) previewStops = colorGradientStops(path, count);
    el.modalHost.innerHTML = "";
    state.arrayViews[path] = { mode: "single", index: 0 };
    update(path, previewStops, { select: path, keepScroll: true });
    toast(meta.toast, `${count} 个渐变断点已进入草稿。`);
  });
}

function addDefault(kind) {
  const factories = {
    rule: () => ({ name: "new-rule", url: "", slaveid: [], script: [], runtime: {} }),
    slave: () => ({ id: "new-slave", type: "miaospeed", token: "", address: "127.0.0.1:8765", path: "/", tls: false, skipCertVerify: false, hidden: false, comment: "", option: {} }),
    script: () => ({ type: "gojajs", name: "NewScript", rank: 0, content: "" }),
    command: () => ({ name: "newcmd", title: "新命令", text: "执行测试", rule: "", enable: true, pin: false, attachToInvite: false }),
  };
  const paths = { rule: "$.rules", slave: "$.slaveConfig.slaves", script: "$.scriptConfig.scripts", command: "$.bot.commands" };
  const path = paths[kind];
  const index = insertIndexFor(path);
  updateArray(path, (arr) => arr.splice(index, 0, factories[kind]()), { expandIndex: index });
}

function bindEvents() {
  const queryApiBase = new URLSearchParams(window.location.search).get("apiBase");
  const storedApiBase = window.localStorage.getItem(apiBaseKey) || "";
  const initialApiBase = queryApiBase !== null ? queryApiBase : storedApiBase;
  try {
    applyApiBase(initialApiBase, { silent: true });
  } catch (error) {
    state.apiBase = "";
    syncApiBaseStorage();
    if (el.apiBaseHint) el.apiBaseHint.textContent = `API 地址无效：${error.message}`;
  }
  el.apiBase?.addEventListener("change", async () => {
    try {
      const nextApiBase = el.apiBase.value;
      if (state.config && state.dirtyPaths.size && !await confirmDanger("切换 API 地址", "切换后会重新拉取配置，未保存草稿会丢失。")) {
        el.apiBase.value = state.apiBase;
        return;
      }
      applyApiBase(nextApiBase, { silent: true });
      toast("API 地址已更新", state.backendMode === "local" ? "已切换为 config.yaml 生成器。" : (state.apiBase || "已切换为同源 API。"));
      await loadConfig();
    } catch (error) {
      toast("API 地址无效", error.message, "warning");
      el.apiBase.value = state.apiBase;
    }
  });

  const rememberPassword = window.localStorage.getItem(rememberPasswordKey) === "1";
  el.rememberPassword.checked = rememberPassword;
  el.password.value = rememberPassword ? (window.localStorage.getItem(storageKey) || "") : "";
  if (!rememberPassword) window.localStorage.removeItem(storageKey);
  el.password.addEventListener("change", syncPasswordStorage);
  el.password.addEventListener("input", () => {
    if (el.rememberPassword.checked) syncPasswordStorage();
  });
  el.rememberPassword.addEventListener("change", syncPasswordStorage);
  el.toggleAccess.addEventListener("click", () => {
    el.password.type = el.password.type === "password" ? "text" : "password";
  });
  el.scrollTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  el.scrollBottom.addEventListener("click", () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  });
  window.addEventListener("scroll", updateScrollTools, { passive: true });
  window.addEventListener("resize", updateScrollTools);
  el.nav.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-item");
    if (!button) return;
    state.activeView = button.dataset.view;
    el.search.value = "";
    render();
    document.querySelector("#main").focus();
  });
  el.search.addEventListener("input", renderSearch);
  el.searchResults.addEventListener("click", (event) => {
    const row = event.target.closest("[data-path]");
    if (!row) return;
    const path = row.dataset.path;
    state.selectedPath = path;
    state.activeView = viewIdForPath(path);
    render();
    const escaped = window.CSS?.escape ? window.CSS.escape(path) : path.replace(/["\\]/g, "\\$&");
    const field = document.querySelector(`[data-field-path="${escaped}"]`);
    if (field) {
      field.classList.remove("search-hit");
      void field.offsetWidth;
      field.classList.add("search-hit");
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    document.querySelector("#main").focus();
  });

  document.body.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-path]");
    if (!input || input.closest("#json-editor")) return;
    try {
      const path = input.dataset.path;
      if (input.dataset.unsetEmpty === "true" && input.value === "") {
        if (getAt(state.config, path) !== undefined) {
          const next = clone(state.config);
          deleteAt(next, path);
          state.config = next;
          markDirty(path);
          render();
        }
        return;
      }
      const value = readInputValue(input);
      const danger = dangerousChangeMessage(path, value);
      if (danger && !await confirmDanger("确认修改危险字段", danger)) {
        render();
        return;
      }
      update(path, value);
    } catch (error) {
      toast("输入无效", error.message, "warning");
    }
  });
  document.body.addEventListener("change", (event) => {
    const color = event.target.closest("[data-color-for]");
    if (color) update(color.dataset.colorFor, color.value);
    const preset = event.target.closest("[data-preset-for]");
    if (preset && preset.value) {
      update(preset.dataset.presetFor, preset.value, { keepScroll: true });
    }
    const tag = event.target.closest("[data-tag-choice]");
    if (tag) {
      const path = tag.dataset.tagChoice;
      const values = [...document.querySelectorAll("[data-tag-choice]")]
        .filter((item) => item.dataset.tagChoice === path && item.checked)
        .map((item) => item.value);
      update(path, values);
    }
    const resourceKey = event.target.closest("[data-resource-key]");
    if (resourceKey) {
      changeResourceKey(resourceKey.dataset.resourceKey, Number(resourceKey.dataset.index), resourceKey.value);
    }
    const resourceValue = event.target.closest("[data-resource-value]");
    if (resourceValue) {
      changeResourceValue(resourceValue.dataset.resourceValue, Number(resourceValue.dataset.index), resourceValue.value);
    }
  });
  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.toggleSecrets !== undefined) {
      state.showSecrets = !state.showSecrets;
      render();
    }
    const togglePath = target.dataset.arrayToggle;
    if (togglePath) {
      const index = Number(target.dataset.index);
      const length = childCount(getAt(state.config, togglePath, []));
      const view = arrayView(togglePath, length);
      if (view.mode === "single" && view.index === index) {
        setArrayMode(togglePath, "none");
      } else {
        setArraySingle(togglePath, index, length);
      }
      renderPreservingScroll();
      return;
    }
    const singlePath = target.dataset.arraySingle;
    if (singlePath) {
      setArrayMode(singlePath, "single");
      renderPreservingScroll();
      return;
    }
    const expandAllPath = target.dataset.arrayExpandAll;
    if (expandAllPath) {
      setArrayMode(expandAllPath, "all");
      renderPreservingScroll();
      return;
    }
    const collapseAllPath = target.dataset.arrayCollapseAll;
    if (collapseAllPath) {
      setArrayMode(collapseAllPath, "none");
      renderPreservingScroll();
      return;
    }
    if (target.dataset.command === "validate") validateDraft();
    if (target.dataset.command === "saveReload") saveWithMode("save_reload");
    if (target.dataset.addRule !== undefined) addDefault("rule");
    if (target.dataset.addSlave !== undefined) addDefault("slave");
    if (target.dataset.addScript !== undefined) addDefault("script");
    if (target.dataset.addCommand !== undefined) addDefault("command");
    if (target.dataset.clearRules !== undefined && await confirmDanger("清空 rules", "清空后所有测试规则都会进入空状态，保存前请确认已有备份。")) update("$.rules", []);
    const colorRandomOpen = target.dataset.colorRandomOpen;
    if (colorRandomOpen) {
      openColorGradientTool(colorRandomOpen);
    }
    const resourceAdd = target.dataset.resourceAdd;
    if (resourceAdd) {
      addResource(resourceAdd);
    }
    const resourceDel = target.dataset.resourceDel;
    if (resourceDel) {
      const entries = Object.entries(resourceMap(resourceDel));
      const key = entries[Number(target.dataset.index)]?.[0] || "该语言资源";
      if (await confirmDanger("删除语言资源", `确认删除 ${key} 吗？保存前仍会停留在草稿。`)) {
        removeResource(resourceDel, Number(target.dataset.index));
      }
    }
    const colorStopAdd = target.dataset.colorStopAdd;
    if (colorStopAdd) {
      const index = insertIndexFor(colorStopAdd);
      updateArray(colorStopAdd, (arr) => arr.splice(index, 0, defaultColorStop(colorStopAdd)), { expandIndex: index });
    }
    const arrayAdd = target.dataset.arrayAdd;
    if (arrayAdd) {
      const index = insertIndexFor(arrayAdd);
      updateArray(arrayAdd, (arr) => arr.splice(index, 0, ""), { expandIndex: index });
    }
    const arrayDel = target.dataset.arrayDel;
    if (arrayDel) {
      const index = Number(target.dataset.index);
      const length = childCount(getAt(state.config, arrayDel, []));
      updateArray(arrayDel, (arr) => arr.splice(index, 1), { expandIndex: Math.min(index, Math.max(length - 2, 0)) });
    }
    const arrayCopy = target.dataset.arrayCopy;
    if (arrayCopy) {
      const index = Number(target.dataset.index) + 1;
      updateArray(arrayCopy, (arr) => arr.splice(index, 0, clone(arr[Number(target.dataset.index)])), { expandIndex: index });
    }
    const arrayUp = target.dataset.arrayUp;
    if (arrayUp) {
      const index = Number(target.dataset.index);
      updateArray(arrayUp, (arr) => { if (index > 0) [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]; }, { expandIndex: Math.max(index - 1, 0) });
    }
    const cardPath = target.dataset.cardDel;
    if (cardPath && await confirmDanger("删除列表项", `确认删除 ${cardPath}[${target.dataset.index}] 吗？`)) {
      const index = Number(target.dataset.index);
      const length = childCount(getAt(state.config, cardPath, []));
      updateArray(cardPath, (arr) => arr.splice(index, 1), { expandIndex: Math.min(index, Math.max(length - 2, 0)) });
    }
    const copyPath = target.dataset.cardCopy;
    if (copyPath) {
      const index = Number(target.dataset.index) + 1;
      updateArray(copyPath, (arr) => arr.splice(index, 0, clone(arr[Number(target.dataset.index)])), { expandIndex: index });
    }
    const upPath = target.dataset.cardUp;
    if (upPath) {
      const index = Number(target.dataset.index);
      updateArray(upPath, (arr) => { if (index > 0) [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]; }, { expandIndex: Math.max(index - 1, 0) });
    }
  });
  document.body.addEventListener("focusin", (event) => {
    const fieldNode = event.target.closest("[data-field-path]");
    const path = event.target.dataset.path || fieldNode?.dataset.fieldPath;
    if (path) {
      state.selectedPath = path;
      renderInspector();
    }
  });
  document.body.addEventListener("change", (event) => {
    const input = event.target.closest("[data-array-item]");
    if (!input) return;
    updateArray(input.dataset.arrayItem, (arr) => { arr[Number(input.dataset.index)] = input.value; });
  });

  el.reload.addEventListener("click", () => loadConfig());
  el.validate.addEventListener("click", validateDraft);
  el.memory.addEventListener("click", async () => {
    try {
      await putDraft();
    } catch (error) {
      toast("写入内存失败", error.message, "error");
    }
  });
  el.save.addEventListener("click", () => saveWithMode("save"));
  el.saveReload.addEventListener("click", () => saveWithMode("save_reload"));
  el.discardReload.addEventListener("click", async () => {
    const local = state.backendMode === "local";
    if (!await confirmDanger(local ? "放弃当前草稿" : "放弃草稿并从文件重载", local ? "未保存草稿会丢失，并重新读取已保存的生成器草稿。" : "未保存草稿会丢失，后端会重新读取 config.yaml。")) return;
    try {
      await applyMode("discard_reload");
      await loadConfig();
      toast(local ? "草稿已重载" : "已从文件重载", local ? "已从生成器本地存储重载。" : "本地草稿已丢弃。");
    } catch (error) {
      toast("重载失败", error.message, "error");
    }
  });
  el.copyPath.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.selectedPath);
    toast("YAMLPath 已复制", state.selectedPath);
  });
  el.restoreField.addEventListener("click", () => update(state.selectedPath, clone(getAt(state.original, state.selectedPath)), { select: state.selectedPath }));
  el.deleteField.addEventListener("click", async () => {
    if (state.selectedPath === "$") return;
    if (!await confirmDanger("删除字段", `删除 ${state.selectedPath} 会先进入草稿，保存后生效。`)) return;
    const next = clone(state.config);
    const parent = pathOf(tokenize(state.selectedPath).slice(0, -1));
    deleteAt(next, state.selectedPath);
    state.config = next;
    state.selectedPath = parent;
    markDirty(parent);
    render();
  });
  el.syncJson.addEventListener("click", () => {
    el.jsonEditor.value = JSON.stringify(state.config, null, 2);
    toast("JSON 已同步", "高级编辑器已刷新为当前草稿。");
  });
  el.applyJson.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(el.jsonEditor.value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("根配置必须是对象");
      state.config = parsed;
      state.selectedPath = "$";
      markDirty("$");
      render();
      toast("JSON 已应用", "完整草稿已被替换，保存前请校验。");
    } catch (error) {
      toast("JSON 无效", error.message, "error");
    }
  });
  el.refreshYaml.addEventListener("click", refreshYaml);
  el.exportYaml.addEventListener("click", exportYaml);
  document.querySelector(".segmented").addEventListener("click", (event) => {
    const button = event.target.closest("[data-editor-tab]");
    if (!button) return;
    state.editorTab = button.dataset.editorTab;
    document.querySelectorAll("[data-editor-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
    el.jsonEditor.classList.toggle("is-hidden", state.editorTab !== "json");
    el.yamlEditor.classList.toggle("is-hidden", state.editorTab !== "yaml");
    if (state.editorTab === "yaml" && !el.yamlEditor.value) refreshYaml();
  });
}

bindEvents();
renderChrome();
renderNav();
await loadDefaultConfigTemplate();
loadConfig({ discardColdSample: true, initial: true });
