# 华夏系统增强工具

华夏系统增强工具是一款面向脚本猫、Tampermonkey 等用户脚本管理器的浏览器脚本，运行于华夏相关系统页面。脚本提供常用学工操作入口，并集成请求调试、重写规则和接口日志等高级工具。

## 功能介绍

### 学工系统快捷工具

- **请假销假**：查询当前请假记录，并在脚本面板中执行销假。
- **学生活动**：查询活动列表和详情，查看报名状态、活动提醒，并提供报名、签到、签退等相关操作。
- **假期登记**：查询假期登记活动，执行离校、到达和返校确认。
- **晚寝签到**：查看晚寝考勤活动并执行签到相关操作。
- **移植接口目录**：内置学工系统常用接口，支持修改参数、发起请求及保存为自定义 API。
- **WebVPN 改名**：在 WebVPN 页面修改账号姓名和昵称。

### 页面与权限增强

- 自动修补部分页面字段，改善特定页面和嵌套页面的可用性。
- 内置规则可解除综测活动未开始、综测申请过期、Plat 应用访问、学生活动审核等前端限制。
- 综测活动列表默认加载全部学年活动。
- 可按需启用或关闭字段修补、API 规则、API 日志和页面 UA 锁定。
- 页面连续无响应时提供自动恢复机制。

### 调试与高级功能

- **API 调试**：支持 `GET`、`POST`、`PUT`、`DELETE` 请求，可编辑 URL、请求头和请求体，并保存常用 API。
- **API 日志**：记录页面中的 XHR 和 Fetch 请求，显示原始响应及修改后的响应；日志条目支持编辑、重放和保存。
- **请求重写**：支持替换请求、替换响应、修改请求、修改响应和请求重定向，可使用普通文本或正则表达式匹配 URL 与内容。
- **Cookie 复制**：复制当前页面中 JavaScript 可读取的 Cookie；`HttpOnly` Cookie 不可读取。
- **配置持久化**：脚本设置、自定义规则、已保存 API 和受数量限制的 API 日志会保存在用户脚本管理器中。

## 适用范围

- `https://me.hxxy.edu.cn/*`
- `https://plat.hxxy.edu.cn/*`
- `https://*.hxxy.edu.cn/*`

脚本需要用户先正常登录对应系统，并使用当前浏览器会话执行操作。涉及提交、签到、销假、审核等写操作时，请在发送前核对页面账号、接口参数和当前记录。

## 基本使用

1. 按下方教程安装脚本猫并导入 [`main.user.js`](./main.user.js)。
2. 登录[华夏学工系统](https://me.hxxy.edu.cn/)。
3. 页面右侧出现“华夏”悬浮按钮后，点击按钮打开增强工具面板。
4. 普通功能位于“工具箱”；请求日志、API 调试、重写规则和开关项可从面板顶部直接进入。

## 完整安装教程

**华夏系统增强脚本使用教程(By Zhang)**

**一、脚本简介**

这是一款增强学工系统功能的脚本猫浏览器插件的脚本，支持在浏览器环境下一键执行销假、学生活动报名签到签退、晚寝签到、假期登记离校到达返校等操作，为学工系统的使用提供强力辅助。

也可为专业用户提供API调试、请求重写等高级功能。

<img src="docs/images/installation/media/image1.png" style="width:3.18736in;height:3.93701in" alt="图形用户界面, 文本, 应用程序 AI 生成的内容可能不正确。" />

**二、运行环境**

本脚本需要支持运行脚本猫、油猴脚本插件的浏览器环境。本教程面向零基础人群，以Microsoft Edge浏览器为例，从安装脚本管理器开始教学。

<img src="docs/images/installation/media/image2.png" style="width:1.82516in;height:0.55005in" alt="形状 AI 生成的内容可能不正确。" />

本教程的安装教程分为电脑部分和手机(平板)部分。Windows、Mac、Linux请查看电脑教程，安卓和苹果请查看手机(平板)教程。

**<span class="mark">如果您是专业用户，把脚本导入脚本猫即可，本教程对您可能无帮助</span>**

**三、手机(平板)教程**

本章节教程适用于安卓、苹果手机，可前往应用商店安装Edge浏览器。

<span class="mark">安卓平板、iPad同样适用本章节教程</span>

<img src="docs/images/installation/media/image3.png" style="width:4.43333in;height:0.96342in" alt="文本 AI 生成的内容可能不正确。" />

**（一）保存脚本文件**

若你是从微信收到脚本文件的，先点击聊天记录中的脚本文件，然后点击右上角三个点，点击“保存”按钮将脚本文件保存到本地，并记住保存的位置。

| <img src="docs/images/installation/media/image4.png" style="width:1.78996in;height:3.93701in" /> | <img src="docs/images/installation/media/image5.png" style="width:1.78996in;height:3.93701in" /> |
|----|----|

**\**

**（二）浏览器插件的安装**

第一步、打开Edge浏览器，点击右下角的菜单，然后点击“扩展”

| <img src="docs/images/installation/media/image6.png" style="width:1.61096in;height:3.54331in" alt="图表 AI 生成的内容可能不正确。" /> | <img src="docs/images/installation/media/image7.png" style="width:1.61096in;height:3.54331in" /> |
|----|----|

------------------------------------------------------------------------

第二步、找到“脚本猫”并点击获取，勾选允许并点击“添加”

| <img src="docs/images/installation/media/image8.png" style="width:1.61096in;height:3.54331in" alt="图形用户界面, 应用程序 AI 生成的内容可能不正确。" /> | <img src="docs/images/installation/media/image9.png" style="width:1.61096in;height:3.54331in" /> |
|----|----|

------------------------------------------------------------------------

第三步、稍等片刻，脚本猫即安装完毕。

<img src="docs/images/installation/media/image10.png" style="width:1.78968in;height:3.93701in" />

------------------------------------------------------------------------

**（三）脚本的导入**

第四步、再次打开“拓展”菜单，然后点击脚本猫。

| <img src="docs/images/installation/media/image11.png" style="width:1.78996in;height:3.93701in" /> | <img src="docs/images/installation/media/image12.png" style="width:1.78996in;height:3.93701in" /> |
|----|----|

------------------------------------------------------------------------

第五步、在弹出的界面中点击小齿轮图标，

进入插件页面后点击“跳过”

| <img src="docs/images/installation/media/image13.png" style="width:1.78996in;height:3.93701in" /> | <img src="docs/images/installation/media/image14.png" style="width:1.78996in;height:3.93701in" /> |
|----|----|

------------------------------------------------------------------------

第六步、点击“新建脚本”，选择“本地导入”。

找到你保存的脚本，点击它。

| <img src="docs/images/installation/media/image15.png" style="width:1.78996in;height:3.93701in" /> | <img src="docs/images/installation/media/image16.png" style="width:1.78996in;height:3.93701in" /> |
|----|----|

------------------------------------------------------------------------

第七步、点击“安装”按钮，脚本即导入完毕。

| <img src="docs/images/installation/media/image17.png" style="width:1.61096in;height:3.54331in" /> | <img src="docs/images/installation/media/image18.png" style="width:1.61096in;height:3.54331in" /> |
|----|----|

------------------------------------------------------------------------

**（四）使用说明**

现在你可以前往 学工系统(链接：https://me.hxxy.edu.cn) 使用脚本了。<span class="mark">移动端特别注意：你可能需要在菜单里点击“查看桌面网站”才能访问</span>，登录完毕之后，你可以再次点击菜单里的“手机网站”切换回手机页面方便使用。

| <img src="docs/images/installation/media/image19.png" style="width:1.61096in;height:3.54331in" /> | <img src="docs/images/installation/media/image20.png" style="width:1.61096in;height:3.5431in" /> |
|----|----|

**四、电脑教程**

以Windows操作系统为例，MacOS、Linux同理。

1.  保存脚本文件：把接收到的脚本文件保存到一个你找得到的位置。

2.  浏览器插件的安装

第一步、打开Microsoft Edge浏览器

<img src="docs/images/installation/media/image21.png" style="width:0.70839in;height:1.00009in" alt="徽标, 公司名称 AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第二步、搜索“脚本猫”

或直接进入网址：https://scriptcat.org/zh-CN

<img src="docs/images/installation/media/image22.png" style="width:3.48333in;height:3.64941in" alt="图形用户界面, 文本, 应用程序, 电子邮件 AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第三步、点击“添加到Edge浏览器”按钮，

或直接进入插件网址：https://microsoftedge.microsoft.com/addons/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB/liilgpjgabokdklappibcjfablkpcekh

<img src="docs/images/installation/media/image23.png" style="width:5.11811in;height:2.54673in" alt="图形用户界面, 文本, 应用程序, Teams AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第四步、点击“获取”按钮。

稍等片刻，在弹出窗中点击“添加扩展”

<img src="docs/images/installation/media/image24.png" style="width:5.11811in;height:2.57138in" alt="图形用户界面, 应用程序 AI 生成的内容可能不正确。" />

<img src="docs/images/installation/media/image25.png" style="width:3.93701in;height:2.43302in" alt="文本, 应用程序 AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第五步、在菜单中点击“扩展”，然后点击“管理扩展”

<img src="docs/images/installation/media/image26.png" style="width:4.72441in;height:6.02012in" alt="图形用户界面, 应用程序 AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第六步、点击脚本猫下方的“详细信息”

勾选“允许用户脚本”

<img src="docs/images/installation/media/image27.png" style="width:5.76806in;height:2.60208in" alt="图形用户界面, 文本, 应用程序, 电子邮件 AI 生成的内容可能不正确。" />

<img src="docs/images/installation/media/image28.png" style="width:5.76806in;height:2.86111in" alt="图形用户界面, 文本, 应用程序, 电子邮件 AI 生成的内容可能不正确。" />

------------------------------------------------------------------------

第七步、点击右上角的拼图图标，点击“脚本猫”

然后点击小齿轮图标

| <img src="docs/images/installation/media/image29.png" style="width:2.3622in;height:1.76638in" /> | <img src="docs/images/installation/media/image30.png" style="width:1.86667in;height:1.86667in" /> |
|----|----|

------------------------------------------------------------------------

第八步、点击右上角的“新建脚本”，选择“本地导入”

找到你的脚本文件打开

<img src="docs/images/installation/media/image31.png" style="width:3.15833in;height:2.80318in" />

------------------------------------------------------------------------

第九步、点击“安装”按钮，脚本即导入成功

| <img src="docs/images/installation/media/image32.png" style="width:2.9047in;height:2in" /> | <img src="docs/images/installation/media/image33.png" style="width:2.65972in;height:1.3811in" /> |
|----|----|

------------------------------------------------------------------------

现在你可以前往 学工系统(链接：https://me.hxxy.edu.cn) 使用脚本了。

<img src="docs/images/installation/media/image34.png" style="width:4.18333in;height:2.05389in" alt="图形用户界面, 应用程序, Teams AI 生成的内容可能不正确。" />
