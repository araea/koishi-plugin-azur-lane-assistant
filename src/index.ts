import {Context, h, Schema} from 'koishi'

import https from "https";
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-markdown-to-image-service'

import {load} from "cheerio";
import iconv from "iconv-lite";

export const inject = {
  required: ['puppeteer'],
  optional: ['markdownToImage'],
}
export const name = 'azur-lane-assistant'
export const usage = `## 🌈 使用

- 需要确保先启动 Puppeteer 服务以正常运行插件。

- 如需启用官方动态推送功能，需要提供您的哔哩哔哩 Cookie 中的 buvid3 值（需登录获取 - [获取教程](https://forum.koishi.xyz/t/topic/6427/11)）。

- 建议为常用命令自行设置别名以便使用。

## 🌼 指令

- \`azurLaneAssistant\` - 查看使用帮助
- \`azurLaneAssistant.舰娘\` - 舰娘相关指令
  - \`azurLaneAssistant.舰娘.列表\` - 查看舰娘列表
  - \`azurLaneAssistant.舰娘.查询\` - 查询单个舰娘
- \`azurLaneAssistant.装备\` - 装备相关指令
  - \`azurLaneAssistant.装备.列表\` - 查看装备列表
  - \`azurLaneAssistant.装备.查询\` - 查询单个装备
- \`azurLaneAssistant.井号碧蓝榜\` - 井号碧蓝榜相关指令
  - \`azurLaneAssistant.井号碧蓝榜.列表\` - 查看榜单列表
  - \`azurLaneAssistant.井号碧蓝榜.查询\` - 查看单个榜单`

export interface Config {
  // isConsolePromptEnabled: boolean
  defaultShipGirlsListBatchCount: number
  defaultEquipmentsListBatchCount: number
  defaultRanksListBatchCount: number
  imageType: "png" | "jpeg" | "webp"
  isBilibiliAzurLaneOfficialDynamicPushEnabled: boolean
  buvid3: string
  shouldIncludeTimeInDynamicPush: boolean
  isInitialOfficialAccountUpdate: boolean
  shouldConvertTextToImage: boolean
  pushRequestIntervalSeconds: number
  pushGroupIDs: string[]
  pushUserIDs: string[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultShipGirlsListBatchCount: Schema.number().min(1).max(10).default(5).description(`发送舰娘列表的默认批次数，最大值为 \`10\`。`),
    defaultEquipmentsListBatchCount: Schema.number().min(1).max(10).default(5).description(`发送装备列表的默认批次数，最大值为 \`10\`。`),
    defaultRanksListBatchCount: Schema.number().min(1).max(5).default(1).description(`发送井号碧蓝榜列表的默认批次数，最大值为 \`5\`。`),
    // isConsolePromptEnabled: Schema.boolean().default(true).description('是否在控制台打印提示信息。'),
    imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description(`发送的图片类型。`),
    isBilibiliAzurLaneOfficialDynamicPushEnabled: Schema.boolean().default(false).description('是否启用哔哩哔哩碧蓝航线官方的动态推送功能。'),
  }).description('基础配置'),
  Schema.union([
    Schema.object({
      isBilibiliAzurLaneOfficialDynamicPushEnabled: Schema.const(true).required(),
      buvid3: Schema.string().description('哔哩哔哩 Cookie 中 buvid3 的值。'),
      shouldIncludeTimeInDynamicPush: Schema.boolean().default(true).description('是否在推送动态的时候加上时间信息。'),
      isInitialOfficialAccountUpdate: Schema.boolean().default(false).description('是否在第一次发送碧蓝航线官方账号当前最新的动态。'),
      shouldConvertTextToImage: Schema.boolean().default(false).description('是否将推送的动态文本转换成图片（可选），如需启用，需要启用 \`markdownToImage\` 服务。'),
      pushRequestIntervalSeconds: Schema.number().default(60).description('监听动态的请求间隔，单位是秒。'),
      pushGroupIDs: Schema.array(String).role('table').description('启用推送的群组IDs。'),
      pushUserIDs: Schema.array(String).role('table').description('启用推送的用户IDs（需要是好友）。'),
    }),
    Schema.object({}),
  ])
]) as any

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('azurLaneAssistant')
  const {
    defaultShipGirlsListBatchCount,
    defaultEquipmentsListBatchCount,
    defaultRanksListBatchCount,
    // isConsolePromptEnabled,
    imageType,
    isBilibiliAzurLaneOfficialDynamicPushEnabled,
    buvid3,
    shouldIncludeTimeInDynamicPush,
    isInitialOfficialAccountUpdate,
    shouldConvertTextToImage,
    pushRequestIntervalSeconds,
    pushGroupIDs,
    pushUserIDs,
  } = config

  interface ShipGirl {
    name: string;
    tags: string;
    pics: string[];
    title: string;
  }

  let shipGirls: ShipGirl[] = [];


  interface Equipment {
    tags: string;
    title: string;
    img: string;
    name: string;
  }

  let equipments: Equipment[] = [];

  interface Rank {
    altWithoutExtension: string;
    src: string;
  }

  let ranks: Rank[] = [];

  // 哔哩哔哩 碧蓝航线官方动态推送 ts* jt*
  if (isBilibiliAzurLaneOfficialDynamicPushEnabled) {
    // 定义请求参数
    const options = {
      hostname: 'api.bilibili.com',
      path: '/x/polymer/web-dynamic/v1/feed/space?offset=&host_mid=233114659',
      headers: {
        'Cookie': `buvid3=${buvid3}`
      }
    };

    const interval = pushRequestIntervalSeconds * 1000;
    let timer;
    let lastText = '';
    // 记录请求次数
    let requestedCount = 0;

    function makeRequest() {
      https.get(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', async () => {
          const jsonData = JSON.parse(data);
          const items = jsonData.data.items;
          if (items.length > 0) {
            const modules = items[0].modules;
            if (modules && modules.module_dynamic && modules.module_dynamic.major && modules.module_dynamic.desc.text && modules.module_dynamic.major.draw.items) {
              const draw = modules.module_dynamic.major.draw;
              const pics = draw.items || [];
              const text = modules.module_dynamic.desc.text || "";


              // logger.info('Pics:', pics);
              // logger.info('Text:', text);

              let result = `${shouldConvertTextToImage ? text.replace(/#/, '# #') : text}\n\n`;
              pics.forEach((pic, index) => {
                // result += `![pic${index + 1}](${pic.url})\n\n`;
                result += shouldConvertTextToImage ? `![pic${index + 1}](${pic.src})\n\n` : `${h.image(pic.src)}\n\n`;
              });
              result = result.trim();
              if (shouldIncludeTimeInDynamicPush) {
                const currentTime: Date = new Date();
                const beijingTime: string = currentTime.toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"});
                result = shouldConvertTextToImage ? `>${beijingTime}\n\n${result}` : `${beijingTime}\n\n${result}`;
              }
              // logger.info(result);
              // 如果 text 变了，说明动态更新了
              if (text !== lastText) {
                // 遍历 bots 获取 bot 信息，以便发送信息
                for (const currentBot of ctx.bots) {
                  // 遍历 pushGroupIDs 字符串数组 为每一个群组发送动态推送
                  for (const groupId of pushGroupIDs) {
                    if (isInitialOfficialAccountUpdate || requestedCount !== 0) {
                      if (shouldConvertTextToImage) {
                        const imageBuffer = await ctx.markdownToImage.convertToImage(result)
                        await currentBot.sendMessage(groupId, h.image(imageBuffer, `image/${imageType}`));
                      } else {
                        await currentBot.sendMessage(groupId, result);
                      }
                    }
                  }
                  for (const userId of pushUserIDs) {
                    if (isInitialOfficialAccountUpdate || requestedCount !== 0) {
                      const channel = await currentBot.createDirectChannel(userId)
                      if (shouldConvertTextToImage) {
                        const imageBuffer = await ctx.markdownToImage.convertToImage(result)
                        await currentBot.sendMessage(channel.id, h.image(imageBuffer, `image/${imageType}`));
                      } else {
                        await currentBot.sendMessage(channel.id, result);
                      }
                    }
                  }
                }
                lastText = text;
                logger.success(`最新动态推送成功！`)
              }

              ++requestedCount
            } else {
              logger.error('无法找到所需数据，请检查配置项是否填写正确！');
            }
          } else {
            logger.error('返回数据中没有 items，请检查配置项是否填写正确！');
          }
        });
      }).on('error', (err) => {
        logger.error('发生错误：', err);
      });
    }

    function startRequest() {
      makeRequest();
      timer = setInterval(makeRequest, interval);
      logger.success('插件已启用，碧蓝航线最新动态监听开始。')
    }

    function stopRequest() {
      clearInterval(timer);
    }

    startRequest();

    process.on('exit', () => {
      stopRequest();
    });

    ctx.on('dispose', () => {
      stopRequest();
      logger.success('插件已停用，已停止监听碧蓝航线最新动态。')
    })

  }

  // h*
  ctx.command('azurLaneAssistant', '查看碧蓝航线小助手帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant -h`)
    })
  // 舰娘* jn*
  ctx.command('azurLaneAssistant.舰娘', '查看舰娘指令帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant.舰娘 -h`)
    })
  // 舰娘.列表* jnlb*
  ctx.command('azurLaneAssistant.舰娘.列表 [batchCount:number]', '查看舰娘列表')
    .option('initialize', '-i 初始化舰娘列表')
    .action(async ({session, options}, batchCount = defaultShipGirlsListBatchCount) => {
      if (isNaN(batchCount) || batchCount <= 0) {
        return '批次数必须是一个大于 0 的数字！';
      }
      if (batchCount > 10) return `批次数超出范围，最大值为 10。`
      // 请求链接
      const url = 'https://wiki.biligame.com/blhx/%E8%88%B0%E8%88%B9%E5%9B%BE%E9%89%B4';

      // 发送HTTPS请求
      https.get(url, (response) => {
        let chunks = [];

        // 接收数据
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        // 接收完数据后，解析网页信息
        response.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const $ = load(data);
          const cardSelectTr = $('#CardSelectTr');

          const newShipGirls = [];

          cardSelectTr.children().each((index, element) => {
            const name = $(element).find('.jntj-4 a').text();

            const tagsArray = [];
            for (let i = 1; i <= 4; i++) {
              const param = $(element).attr(`data-param${i}`);
              if (param) {
                const cleanedParam = param.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
                tagsArray.push(...cleanedParam);
              }
            }
            const tags = tagsArray.join(' ');

            const pics = $(element).find('.jntj-2 img').map((i, img) => $(img).prop('outerHTML')).get();

            const obj = {
              name: name,
              tags: tags,
              pics: pics,
              title: $(element).find('.jntj-4 a').attr('title')
            };

            newShipGirls.push(obj);
          });

          if (newShipGirls !== shipGirls) shipGirls = newShipGirls
          // logger.log(shipGirls); // 输出对象数组
          // fs.writeFile('shipGirls.json',  JSON.stringify(shipGirls), (err) => {
          //   if (err) throw err;
          //   logger.success('文件已保存');
          // });
          const shipGirlsLength = shipGirls.length;
          const batchSize = Math.floor(shipGirlsLength / batchCount); // 每批处理的数量
          let serialNumber = 1; // 序号变量
          let tableRows = [];

          const tableStyle = `
    <style>
        body {
            margin: 0;
            zoom: 200%;
        }

        .list {
            display: flex;
            flex-direction: column;
            width: max-content;
            overflow: scroll;
        }

        table {
            border-collapse: collapse;
            border-spacing: 0;
            width: 100%;
            height: min-content;
            border: 1px solid #ddd;
        }

        th,
        td {
            text-align: left;
            padding-top: 3px;
            padding-bottom: 3px;
            padding-right: 5px;
            display: flex;
            flex-direction: column;
            width: max-content;
        }

        tr:nth-child(even) {
            background-color: #f5f5f5;
        }

        .line1 {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: max-content;
            position: relative; /* 添加相对定位 */
        }

        .avatar {
            position: relative; /* 添加相对定位 */
        }

        .avatar img:first-child {
            position: absolute; /* 添加绝对定位 */
            top: 0;
            left: 0;
        }

        .avatar img:last-child {
            width: 60px; /* 设置外框宽度 */
            height: 60px; /* 设置外框高度 */
        }

        .name {
            color: #444444;
            margin-left: 5px;
        }

        .tags {
            color: #6c757d;
            font-size: xx-small;
            margin-left: 0;
        }
    </style>
    `;

          const generateTable = (rows: any): string => {
            return `
        <html lang="zh">
          <head>
            ${tableStyle}
          <title>舰娘列表</title></head>
          <body>
            <div class="list">
              <table>
                ${rows.join('\n')}
              </table>
            </div>
          </body>
        </html>
      `;
          };

          const page = await ctx.puppeteer.page();
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= shipGirlsLength; i++) {
            const shipGirl = shipGirls[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="avatar">
                        ${shipGirl.pics[1]}
                        ${shipGirl.pics[0]}
                    </div>
                    <div class="name">${serialNumber++}. ${shipGirl.name}</div>
                </div>
                <div class="line2">
                    <div class="tags">${shipGirl.tags}</div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === shipGirlsLength) && !options.initialize) {
              const html = generateTable(tableRows);
              await page.setContent(html, {waitUntil: 'load'});
              const imgBuffer = await page.screenshot({fullPage: true, type: imageType});
              // fs.writeFile('result3.png', imgBuffer, (err) => {
              //   if (err) throw err;
              //   logger.success('文件已保存');
              // });
              await session.send(h.image(imgBuffer, `image/${imageType}`));
              tableRows = [];
            }
          }
          if (options.initialize) logger.success(`舰娘列表初始化成功！`)
          await page.close();
        });

      }).on("error", (error) => {
        logger.error("请求出错：", error.message);
      });

      //
    })
    .execute({options: {initialize: true}})

  // 舰娘.查询* jncx*
  ctx.command('azurLaneAssistant.舰娘.查询 [indexOrName:text]', '查询舰娘信息')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询的【舰娘名】或【序号】或【取消】：`);
        const userInput = await session.prompt();
        if (!userInput) return `输入超时。`;
        if (userInput === '取消') return `本次查询已取消。`;
        indexOrName = userInput;
      }
      let selectedShipGirl: ShipGirl;
      if (!isNaN(Number(indexOrName))) {
        const index = parseInt(indexOrName);
        if (index > 0 && index <= shipGirls.length) {
          selectedShipGirl = shipGirls[index - 1];
        } else {
          return `序号超出范围。`;
        }
      } else {
        selectedShipGirl = shipGirls.find((girl) => girl.name === indexOrName);
        if (!selectedShipGirl) selectedShipGirl = shipGirls.find((girl) => girl.title === indexOrName);
        if (!selectedShipGirl) {
          return `未找到舰娘。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selectedShipGirl.title}`;
      https.get(url, (res) => {
        let chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          // fs.writeFile('originalHtml.html', data, (err) => {
          //   if (err) {
          //     return logger.error(err);
          //   }
          //   logger.success('originalHtml.html 已保存。');
          // });
          const $ = load(data);
          // 删除表格中的 max-height 属性
          $('div[style*="max-height"]').removeAttr('style');

          // 删除 canvas 并设置性能表的 width 100
          // 删除指定的 canvas 元素
          $('canvas[data-type="canvas"]').remove();
          // 将包含指定样式的 th 标签的样式改成 <th style="width:100%;">
          $('th:has(table.wikitable.sv-breakthrough)').css('width', '100%');
          // 将所有具有 class="tab-pane" 的元素设置为 active
          $('div.tab-pane').addClass('active');
          // 找到所有 role="presentation" 的 li 标签，将其属性设置为 active
          $('li[role="presentation"]').each((index, element) => {
            const li = $(element);
            if (!li.hasClass('active')) {
              li.addClass('active');
            }
          });
          // 找到所有非 active 的 <li class="tab_li"> 标签并设置为 active
          $('.TabContainer .tab_li:not(.active)').addClass('active');
          $('.TabContainer .tab_con:not(.active)').addClass('active');
          // 删除所有包含 sm-bar 类的元素
          $('div.sm-bar').remove();
          $('span.badge.pull-right').remove(); // 删除指定的网页元素
          $('div.mw-references-wrap').remove(); // 删除 <div class="mw-references-wrap"> 标签
          // 删除最后一个 <div class="panel panel-shiptable"> 标签
          const shiptables = $('div.panel.panel-shiptable');
          if (shiptables.length > 0) {
            shiptables.last().remove();
          }
          // 通过锚点文本删除指定的元素
          $('a[href="#其它舰船"]').parent().remove();
          $('h2 span.mw-headline#其它舰船').parent().remove(); // 删除包含特定类和ID的 h2 下的 span 元素
          $('div.bread.mwiki_hide, div.bread span.mwiki_hide').remove(); // 删除指定的两个网页元素
          $('div.mw-parser-output').find('div.bread, div.bread span').remove(); // 删除指定的两个网页元素
          // 选择所有带有 class="heimu" 的元素，并移除它们的 class 属性
          $('span.heimu').removeAttr('class');
          // 查找并添加链接的前缀
          $('a[href^="/blhx"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
              $(element).attr('href', `https://wiki.biligame.com${href}`);
            }
          });
          const mwParserOutputContent = $('div.mw-parser-output').html(); // 获取指定标签的内容
          if (mwParserOutputContent) {
            // logger.success(mwParserOutputContent);

            const html = `
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/bootstrap.min.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/rank-buddle.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/vector.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/styles.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/toapp-buddle.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/pluginsCommon-buddle.css?version=76"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no"/>
<meta name="renderer" content="webkit"/>
<!DOCTYPE html>
<html class="client-nojs" lang="zh-Hans-CN" dir="ltr">
<head>
    <meta charset="UTF-8"/>
    <title>舰娘图鉴</title>
    <style>
    .ship_word_line, th {
      display: inline-block;
      vertical-align: middle;
    }
    </style>

    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.MobileDetect.nomobile%7Cext.visualEditor.desktopArticleTarget.noscript%7Cmediawiki.page.gallery.styles%7Cskins.vector.styles.legacy&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.smw.style%7Cext.smw.tooltip.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.srf.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=site.styles&amp;only=styles&amp;skin=vector"/>
</head>
<body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-${selectedShipGirl.title} rootpage-${selectedShipGirl.title} skin-vector action-view skin-vector-legacy">
<div class="game-bg container">

    <div id="content" class="container mw-body" role="main">
        <div id="bodyContent" class="mw-body-content">
            <div id="mw-content-text" class="mw-body-content mw-content-ltr" lang="zh-Hans-CN" dir="ltr">
                <div class="mw-parser-output">
                    ${mwParserOutputContent}
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>
`

            // fs.writeFile('shipGirlHtml.html', html, (err) => {
            //   if (err) {
            //     return logger.error(err);
            //   }
            //   logger.success('舰娘信息已保存到 shipGirlHtml.html');
            // });

            const page = await ctx.puppeteer.page();

            await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});

            await page.setContent(html, {waitUntil: 'networkidle2'});

            // await ctx.sleep(6 * 1000)
            // const element = await page.$('.mw-parser-output');
            // const boundingBox = await element.boundingBox();
            // const imgBuffer = await page.screenshot({clip: boundingBox, type: imageType});
            // 自适应页面高度
            // await page.evaluate(() => {
            //   document.body.style.height = document.documentElement.scrollHeight + 'px';
            // });
            // 获取实际内容高度
            // const bodyHandle = await page.$('body');
            // const { height } = await bodyHandle.boundingBox();
            // await bodyHandle.dispose();

            // 重新设置页面高度
            // await page.setViewport({ width: 1280, height: height, deviceScaleFactor: 1 });
            const imgBuffer = await page.screenshot({fullPage: true, type: imageType});

            await page.close();
            await session.send(h.image(imgBuffer, `image/${imageType}`))
            // fs.writeFile(`shipGirlImage.${imageType}`, imgBuffer, (err) => {
            //   if (err) throw err;
            //   logger.success(`shipGirlImage.${imageType} 文件已保存。`);
            // });
          } else {
            logger.error('未找到指定内容');
          }
        });
      }).on('error', (err) => {
        logger.error('请求失败：', err.message);
      });
      //
    });

  // 装备* zb*
  ctx.command('azurLaneAssistant.装备', '查看装备指令帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant.装备 -h`)
    })

  // 装备.列表* zblb*
  ctx.command('azurLaneAssistant.装备.列表 [batchCount:number]', '查看装备列表')
    .option('initialize', '-i 初始化装备列表')
    .action(async ({session, options}, batchCount = defaultEquipmentsListBatchCount) => {
      if (isNaN(batchCount) || batchCount <= 0) {
        return '批次数必须是一个大于 0 的数字';
      }
      if (batchCount > 10) return `批次数超出范围，最大值为 10。`
      // 请求链接
      const url = 'https://wiki.biligame.com/blhx/%E8%A3%85%E5%A4%87%E5%9B%BE%E9%89%B4';

      // 发送HTTPS请求
      https.get(url, (response) => {
        let chunks = [];

        // 接收数据
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        // 接收完数据后，解析网页信息
        response.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const $ = load(data);
          const cardSelectTr = $('#CardSelectTr');

          const newEquipments: Equipment[] = [];

          cardSelectTr.children().each((index, element) => {
            const tagsArray: string[] = [];
            for (let i = 1; i <= 4; i++) {
              const param = $(element).attr(`data-param${i}`);
              if (param) {
                const paramTags = param.split(',').filter(tag => tag.trim() !== '');
                tagsArray.push(...paramTags);
              }
            }
            const tags = tagsArray.join(' ');
            const title = $(element).find('a').attr('title') || '';
            const img = $(element).find('img').prop('outerHTML') || '';
            const name = $(element).find('a').text() || '';

            const equipment: Equipment = {
              tags,
              title,
              img,
              name
            };

            newEquipments.push(equipment);
          });

          if (newEquipments !== equipments) equipments = newEquipments
          // logger.log(equipments); // 输出对象数组
          // fs.writeFile('equipments.json', JSON.stringify(equipments), (err) => {
          //   if (err) throw err;
          //   logger.success('equipments.json 文件已保存');
          // });
          const equipmentsLength = equipments.length;
          const batchSize = Math.floor(equipmentsLength / batchCount); // 每批处理的数量
          let serialNumber = 1; // 序号变量
          let tableRows = [];

          const tableStyle = `
    <style>
        body {
            margin: 0;
            zoom: 200%;
        }

        .list {
            display: flex;
            flex-direction: column;
            width: max-content;
            overflow: scroll;
        }

        table {
            border-collapse: collapse;
            border-spacing: 0;
            width: 100%;
            height: min-content;
            border: 1px solid #ddd;
        }

        th,
        td {
            text-align: left;
            padding-top: 3px;
            padding-bottom: 3px;
            padding-right: 5px;
            display: flex;
            flex-direction: column;
            width: max-content;
        }

        tr:nth-child(even) {
            background-color: #f5f5f5;
        }

        .line1 {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: max-content;
        }

        .name {
            color: #444444;
            margin-left: 5px;
        }

        .tags {
            color: #6c757d;
            font-size: xx-small;
            margin-left: 0;
        }
    </style>
    `;

          const generateTable = (rows: any): string => {
            return `
        <html lang="zh">
          <head>
            ${tableStyle}
          <title>舰娘列表</title></head>
          <body>
            <div class="list">
              <table>
                ${rows.join('\n')}
              </table>
            </div>
          </body>
        </html>
      `;
          };

          const page = await ctx.puppeteer.page();
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= equipmentsLength; i++) {
            const equipment = equipments[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="avatar">
                        ${equipment.img}
                    </div>
                    <div class="name">${serialNumber++}. ${equipment.name}</div>
                </div>
                <div class="line2">
                    <div class="tags">${equipment.tags}</div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === equipmentsLength) && !options.initialize) {
              const html = generateTable(tableRows);
              await page.setContent(html, {waitUntil: 'load'});
              const imgBuffer = await page.screenshot({fullPage: true, type: imageType});
              // fs.writeFile('equipmentsList.png', imgBuffer, (err) => {
              //   if (err) throw err;
              //   logger.success('equipmentsList.png 文件已保存');
              // });
              await session.send(h.image(imgBuffer, `image/${imageType}`));
              tableRows = [];
            }
          }
          if (options.initialize) logger.success(`装备列表初始化成功！`)
          await page.close();
        });

      }).on("error", (error) => {
        logger.error("请求出错：", error.message);
      });
      //
    })
    .execute({options: {initialize: true}})

  // 装备.查询* zbcx*
  ctx.command('azurLaneAssistant.装备.查询 [indexOrName:text]', '查询装备信息')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询的【装备名】或【序号】或【取消】：`);
        const userInput = await session.prompt();
        if (!userInput) return `输入超时。`;
        if (userInput === '取消') return `本次查询已取消。`;
        indexOrName = userInput;
      }
      let selecteEquipment: Equipment;
      if (!isNaN(Number(indexOrName))) {
        const index = parseInt(indexOrName);
        if (index > 0 && index <= equipments.length) {
          selecteEquipment = equipments[index - 1];
        } else {
          return `序号超出范围。`;
        }
      } else {
        selecteEquipment = equipments.find((equipment) => equipment.name === indexOrName);
        if (!selecteEquipment) selecteEquipment = equipments.find((equipment) => equipment.title === indexOrName);
        if (!selecteEquipment) {
          return `未找到装备。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selecteEquipment.title}`;
      https.get(url, (res) => {
        let chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          // fs.writeFile('originalHtml.html', data, (err) => {
          //   if (err) {
          //     return logger.error(err);
          //   }
          //   logger.success('originalHtml.html 已保存。');
          // });
          const $ = load(data);
          // 获取包含 style 属性的元素
          const elementsWithStyle = $('[style]');

          elementsWithStyle.each((index, element) => {
            const styleAttr = $(element).attr('style');
            if (styleAttr) {
              // 删除 max-width:400px 属性
              const updatedStyle = styleAttr.replace(/max-width\s*:\s*400px\s*;?/i, '');
              $(element).attr('style', updatedStyle);
            }
          });
          // 删除所有包含 sm-bar 类的元素
          $('div.sm-bar').remove();
          // 删除延伸阅读
          $('.col-md-4').remove();
          $('span.label.label-default').remove(); // 删除备注
          $('a:contains("文件:")').remove(); // 删除备注的文件
          // 删除最后一个 <div class="panel panel-shiptable"> 标签
          const shiptables = $('div.panel.panel-shiptable');
          if (shiptables.length > 0) {
            shiptables.last().remove();
          }
          // 找到所有 role="presentation" 的 li 标签，将其属性设置为 active
          $('li[role="presentation"]').each((index, element) => {
            const li = $(element);
            if (!li.hasClass('active')) {
              li.addClass('active');
            }
          });
          // 将所有具有 class="tab-pane" 的元素设置为 active
          $('div.tab-pane').addClass('active');
          // 通过锚点文本删除指定的元素
          $('a[href="#装备导航"]').parent().remove();
          $('h2 span.mw-headline#装备导航').parent().remove(); // 删除包含特定类和ID的 h2 下的 span 元素
          $('div.mw-parser-output').find('div.bread, div.bread span').remove(); // 删除指定的两个网页元素
          // 选择所有带有 class="heimu" 的元素，并移除它们的 class 属性
          $('span.heimu').removeAttr('class');
          // 查找并添加链接的前缀
          $('a[href^="/blhx"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
              $(element).attr('href', `https://wiki.biligame.com${href}`);
            }
          });
          const mwParserOutputContent = $('div.mw-parser-output').html(); // 获取指定标签的内容
          if (mwParserOutputContent) {
            // logger.success(mwParserOutputContent);

            const html = `
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/bootstrap.min.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/rank-buddle.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/vector.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/styles.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/toapp-buddle.css?version=76"/>
<link rel="stylesheet" href="https://staticwiki.biligame.com/resources/bili/css/pluginsCommon-buddle.css?version=76"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no"/>
<meta name="renderer" content="webkit"/>
<!DOCTYPE html>
<html class="client-nojs" lang="zh-Hans-CN" dir="ltr">
<head>
    <meta charset="UTF-8"/>
    <title>装备图鉴</title>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.MobileDetect.nomobile%7Cext.visualEditor.desktopArticleTarget.noscript%7Cskins.vector.styles.legacy&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.smw.style%7Cext.smw.tooltip.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.srf.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=site.styles&amp;only=styles&amp;skin=vector"/>
</head>
<body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-${selecteEquipment.title.replace(/#T.*/g, "")} rootpage-${selecteEquipment.title.replace(/#T.*/g, "")} skin-vector action-view skin-vector-legacy">
<div class="game-bg container">
    <div id="content" class="container mw-body" role="main">
        <div id="bodyContent" class="mw-body-content">
            <div id="mw-content-text" class="mw-body-content mw-content-ltr" lang="zh-Hans-CN" dir="ltr">
                <div class="mw-parser-output">
                    ${mwParserOutputContent}
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>
`

            // fs.writeFile('equipmentHtml.html', html, (err) => {
            //   if (err) {
            //     return logger.error(err);
            //   }
            //   logger.success('装备信息已保存到 equipmentHtml.html');
            // });

            const page = await ctx.puppeteer.page();

            await page.setViewport({width: 888, height: 0, deviceScaleFactor: 1});

            await page.setContent(html, {waitUntil: 'networkidle2'});

            // await ctx.sleep(6 * 1000)
            // const element = await page.$('.mw-parser-output');
            // const boundingBox = await element.boundingBox();
            // const imgBuffer = await page.screenshot({clip: boundingBox, type: imageType});
            // 自适应页面高度
            // await page.evaluate(() => {
            //   document.body.style.height = document.documentElement.scrollHeight + 'px';
            // });
            // 获取实际内容高度
            // const bodyHandle = await page.$('body');
            // const { height } = await bodyHandle.boundingBox();
            // await bodyHandle.dispose();

            // 重新设置页面高度
            // await page.setViewport({ width: 1280, height: height, deviceScaleFactor: 1 });
            const imgBuffer = await page.screenshot({fullPage: true, type: imageType});

            await page.close();
            await session.send(h.image(imgBuffer, `image/${imageType}`))
            // fs.writeFile(`equipmentImage.${imageType}`, imgBuffer, (err) => {
            //   if (err) throw err;
            //   logger.success(`equipmentImage.${imageType} 文件已保存。`);
            // });
          } else {
            logger.error('未找到指定内容');
          }
        });
      }).on('error', (err) => {
        logger.error('请求失败：', err.message);
      });
      //
    });

  // 井号碧蓝榜* jhblb*
  ctx.command('azurLaneAssistant.井号碧蓝榜', '查看井号碧蓝榜指令帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant.井号碧蓝榜 -h`)
    })

  // 井号碧蓝榜.列表* jhblblb*
  ctx.command('azurLaneAssistant.井号碧蓝榜.列表 [batchCount:number]', '查看井号碧蓝榜列表')
    .option('initialize', '-i 初始化井号碧蓝榜列表')
    .action(async ({session, options}, batchCount = defaultRanksListBatchCount) => {
      if (isNaN(batchCount) || batchCount <= 0) {
        return '批次数必须是一个大于 0 的数字！';
      }
      if (batchCount > 5) return `批次数超出范围，最大值为 5。`
      // 请求链接
      const url = 'https://wiki.biligame.com/blhx/%E4%BA%95%E5%8F%B7%E7%A2%A7%E8%93%9D%E6%A6%9C%E5%90%88%E9%9B%86';

      // 发送HTTPS请求
      https.get(url, (response) => {
        let chunks = [];

        // 接收数据
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        // 接收完数据后，解析网页信息
        response.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const $ = load(data);
          // 创建一个对象数组，在该标签内，寻找所有的 <img> 标签，获取到该 <img> 标签的特定属性，将属性组合成对象添加到数组中
          const newRanks: { altWithoutExtension: string; src: string }[] = [];

          $("div.mw-parser-output img").each((index, element) => {
            const alt = $(element).attr("alt") || "";
            const src = $(element).attr("src") || "";
            const altWithoutExtension = alt.split('.').slice(0, -1).join('.');
            newRanks.push({altWithoutExtension, src});
          });

          if (newRanks !== ranks) ranks = newRanks
          // logger.log(ranks); // 输出对象数组
          // fs.writeFile('ranks.json', JSON.stringify(ranks), (err) => {
          //   if (err) throw err;
          //   logger.success('ranks 文件已保存');
          // });
          const ranksLength = ranks.length;
          const batchSize = Math.floor(ranksLength / batchCount); // 每批处理的数量
          let serialNumber = 1; // 序号变量
          let tableRows = [];

          const tableStyle = `
    <style>
        body {
            margin: 0;
            zoom: 200%;
        }
        .list {
            display: flex;
            flex-direction: column;
            width: max-content;
            overflow: scroll;
        }
        table {
            border-collapse: collapse;
            border-spacing: 0;
            width: 100%;
            height: min-content;
            border: 1px solid #ddd;
        }
        th,
        td {
            text-align: left;
            padding-top: 3px;
            padding-bottom: 3px;
            padding-right: 5px;
            display: flex;
            flex-direction: column;
            width: max-content;
        }
        tr:nth-child(even) {
            background-color: #f5f5f5;
        }
        .line1 {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: max-content;
        }
        .line2 {
            display: flex;
            flex-direction: row;
            width: max-content;
        }
        .id {
            color: #444444;
            font-size: x-small;
            background-color: #f8f8f8;
            padding: 1px 3px;
            border-radius: 5px;
            border-color: #dee2e6;
            border-style: solid;
            border-width: 1px;
            margin-left: 5px;
        }
        .command {
            color: #444444;
            margin-left: 5px;
        }
        .title {
            color: #6c757d;
            font-size: xx-small;
            margin-left: 10px;
        }
    </style>
`;

          const generateTable = (rows: any): string => {
            return `
        <html lang="zh">
          <head>
            ${tableStyle}
          <title>井号碧蓝榜列表</title>
          </head>
          <body>
            <div class="list">
              <table>
                ${rows.join('\n')}
              </table>
            </div>
          </body>
        </html>
      `;
          };

          const page = await ctx.puppeteer.page();
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= ranksLength; i++) {
            const rank = ranks[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="id">By 井号5467</div>
                    <div class="command">${serialNumber++}. ${rank.altWithoutExtension}</div>
                </div>
                <div class="line2">
                    <div class="title"></div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === ranksLength) && !options.initialize) {
              const html = generateTable(tableRows);
              await page.setContent(html, {waitUntil: 'load'});
              const imgBuffer = await page.screenshot({fullPage: true, type: imageType});
              // fs.writeFile('result3.png', imgBuffer, (err) => {
              //   if (err) throw err;
              //   logger.success('文件已保存');
              // });
              await session.send(h.image(imgBuffer, `image/${imageType}`));
              tableRows = [];
            }
          }
          if (options.initialize) logger.success(`井号碧蓝榜列表初始化成功！`)
          await page.close();
        });

      }).on("error", (error) => {
        logger.error("请求出错：", error.message);
      });

      //
    })
    .execute({options: {initialize: true}})

  // 井号碧蓝榜.查询* jhblbcx*
  ctx.command('azurLaneAssistant.井号碧蓝榜.查询 [indexOrName:text]', '查询井号碧蓝榜')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询的【榜单名】或【序号】或【取消】：`);
        const userInput = await session.prompt();
        if (!userInput) return `输入超时。`;
        if (userInput === '取消') return `本次查询已取消。`;
        indexOrName = userInput;
      }
      let selecteRank: Rank;
      if (!isNaN(Number(indexOrName))) {
        const index = parseInt(indexOrName);
        if (index > 0 && index <= ranks.length) {
          selecteRank = ranks[index - 1];
        } else {
          return `序号超出范围。`;
        }
      } else {
        selecteRank = ranks.find((rank) => rank.altWithoutExtension === indexOrName);
        if (!selecteRank) {
          return `未找到榜单。`;
        }
      }

      await session.send(h.image(selecteRank.src))
      //
    });
}
