# 💠 koishi-plugin-azur-lane-assistant 💠

[![npm](https://img.shields.io/npm/v/koishi-plugin-azur-lane-assistant?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-azur-lane-assistant)

## 🎐 介绍

`koishi-plugin-azur-lane-assistant` 是一个为碧蓝航线提供各种便利功能的 Koishi 插件，包含了:

💠 查看舰娘和装备列表
💠 查询单个舰娘和装备的详细信息
💠 监听并推送哔哩哔哩碧蓝航线官方账号的最新动态
💠 查看人气碧蓝航线创作者 `井号5467` 的井号碧蓝榜
💠 ...

## 🎉 安装

您可以在 Koishi 插件市场中搜索并安装本插件。

## 🌈 使用

- 需要确保先启动 Puppeteer 服务以正常运行插件。

- 如需启用官方动态推送功能，需要提供您的哔哩哔哩 Cookie 中的 buvid3
  值（需登录获取 - [获取教程](https://forum.koishi.xyz/t/topic/6427/11)）。

- 有些长图偶尔会因为长度过长而出现无法预期的 bug，这种情况下，重试即可解决。

- 建议为常用命令自行设置别名以便使用。

## ⚙️ 配置项

- `defaultShipGirlsListBatchCount`：发送舰娘列表的默认批次数，最大值为 `10`。
- `defaultEquipmentsListBatchCount`：发送装备列表的默认批次数，最大值为 `10`。
- `defaultRanksListBatchCount`：发送井号碧蓝榜列表的默认批次数，最大值为 `5`。
- `imageType`：发送的图片类型。

- `isBilibiliAzurLaneOfficialDynamicPushEnabled`：是否启用哔哩哔哩碧蓝航线官方的动态推送功能。
  - `buvid3`：哔哩哔哩 Cookie 中的 buvid3 的值。
  - `shouldIncludeTimeInDynamicPush`：是否在推送动态的时候加上时间信息。
  - `shouldIncludeAzurLaneBilibiliLinkAfterPush`：是否在每次推送后添加碧蓝航线B站官方动态页面链接。
  - `isInitialOfficialAccountUpdate`：是否在第一次发送碧蓝航线官方账号当前最新的动态。
  - `shouldConvertTextToImage`：是否将推送的动态文本转换成图片（可选），如需启用，需要启用 `markdownToImage` 服务。
  - `pushRequestIntervalSeconds`：如果启用，则可以设置监听推送的请求间隔，单位是秒，默认为 `60`。
  - `pushGroupIDs`：启用推送的群组IDs。
  - `pushUserIDs`：启用推送的用户IDs（需要是好友）。

## 🌼 指令

- `azurlaneassistant` - 查看使用帮助
- `azurlaneassistant.攻略` - 攻略相关指令
  - `azurlaneassistant.攻略.余烬boss攻略要点` - 查看余烬boss攻略要点
  - `azurlaneassistant.攻略.月度boss解析` - 查看月度boss解析
- `azurlaneassistant.关卡` - 关卡相关指令
  - `azurlaneassistant.关卡.主线` - 主线关卡相关指令
    - `azurlaneassistant.关卡.主线.查询` - 查询主线关卡
    - `azurlaneassistant.关卡.主线.列表` - 查看主线关卡列表
  - `azurlaneassistant.关卡.总览` - 关卡总览相关指令
    - `azurlaneassistant.关卡.总览.查询` - 查询关卡总览
    - `azurlaneassistant.关卡.总览.列表` - 查看关卡总览列表
- `azurlaneassistant.舰娘` - 舰娘相关指令
  - `azurlaneassistant.舰娘.查询` - 查询舰娘信息
  - `azurlaneassistant.舰娘.立绘` - 查看舰娘立绘
  - `azurlaneassistant.舰娘.列表` - 查看舰娘列表
  - `azurlaneassistant.舰娘.语音` - 获取舰娘语音信息
- `azurlaneassistant.井号碧蓝榜` - 井号碧蓝榜相关指令
  - `azurlaneassistant.井号碧蓝榜.查询` - 查询井号碧蓝榜信息
  - `azurlaneassistant.井号碧蓝榜.列表` - 查看井号碧蓝榜列表
- `azurlaneassistant.装备` - 装备相关指令
  - `azurlaneassistant.装备.查询` - 查询装备信息
  - `azurlaneassistant.装备.列表` - 查看装备列表

## 🍧 致谢

* [Koishi](https://koishi.chat/) - 机器人框架
* https://wiki.biligame.com/blhx/%E9%A6%96%E9%A1%B5 - 碧蓝航线 wiki
* https://forum.koishi.xyz/t/topic/6427/10 - NingHaiY 的求插件帖

## ✨ License

MIT License © 2023
