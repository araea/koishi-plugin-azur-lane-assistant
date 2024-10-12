import {Context, h, Schema} from 'koishi'

import https from "https";
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-markdown-to-image-service'

import {load} from "cheerio";
import iconv from "iconv-lite";
import * as fs from "fs";

export const inject = {
  required: ['puppeteer'],
  optional: ['markdownToImage'],
}
export const name = 'azur-lane-assistant'
export const usage = `## 使用

1. 启动 \`puppeteer\` 服务。
2. 设置指令别名。

- 动态推送功能需 buvid3 的值（[获取教程](https://forum.koishi.xyz/t/topic/6427/11)）。

## 注意事项

- 动态推送可能已失效。
- 长图偶而出现 Bug，重试可解。

## QQ 群

- 956758505`

export interface Config {
  // isConsolePromptEnabled: boolean
  defaultShipGirlsListBatchCount: number
  defaultEquipmentsListBatchCount: number
  defaultRanksListBatchCount: number
  defaultStagesListBatchCount: number
  imageType: "png" | "jpeg" | "webp"
  isBilibiliAzurLaneOfficialDynamicPushEnabled: boolean
  buvid3: string
  shouldIncludeTimeInDynamicPush: boolean
  shouldIncludeAzurLaneBilibiliLinkAfterPush: boolean
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
    defaultStagesListBatchCount: Schema.number().min(1).max(10).default(5).description(`发送关卡列表的默认批次数，最大值为 \`10\`。`),
  }).description('发送列表默认批次数'),
  Schema.object({
    imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description(`发送的图片类型。`),
  }).description('图片发送设置'),
  Schema.object({
    isBilibiliAzurLaneOfficialDynamicPushEnabled: Schema.boolean().default(false).description('是否启用哔哩哔哩碧蓝航线官方的动态推送功能。'),
  }).description('哔哩哔哩碧蓝航线官方动态推送设置'),
  Schema.union([
    Schema.object({
      isBilibiliAzurLaneOfficialDynamicPushEnabled: Schema.const(true).required(),
      buvid3: Schema.string().description('哔哩哔哩 Cookie 中 buvid3 的值。'),
      shouldIncludeTimeInDynamicPush: Schema.boolean().default(true).description('是否在推送动态的时候加上时间信息。'),
      shouldIncludeAzurLaneBilibiliLinkAfterPush: Schema.boolean().default(true).description('在每次推送后是否添加碧蓝航线B站官方动态页面链接。'),
      isInitialOfficialAccountUpdate: Schema.boolean().default(false).description('是否在第一次发送碧蓝航线官方账号当前最新的动态。'),
      shouldConvertTextToImage: Schema.boolean().default(false).description('是否将推送的动态文本转换成图片（可选），如需启用，需要启用 \`markdownToImage\` 服务。'),
      pushRequestIntervalSeconds: Schema.number().default(60).description('监听动态的请求间隔，单位是秒。'),
      pushGroupIDs: Schema.array(String).role('table').description('启用推送的频道IDs。'),
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
    defaultStagesListBatchCount,
    // isConsolePromptEnabled,
    imageType,
    isBilibiliAzurLaneOfficialDynamicPushEnabled,
    buvid3,
    shouldIncludeTimeInDynamicPush,
    shouldIncludeAzurLaneBilibiliLinkAfterPush,
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

  interface Stage {
    title: string;
    name: string;
    href: string;
    img: string;
    altName: string;
  }

  let stages: Stage[] = [];

  interface mainlineStage {
    stageNumber: string
    stageName: string
  }

  const manlineStages: mainlineStage[] = [
    {
      "stageNumber": "1-1",
      "stageName": "近海演习"
    },
    {
      "stageNumber": "1-1Hard",
      "stageName": "近海演习（困难）"
    },
    {
      "stageNumber": "1-2",
      "stageName": "虎！虎！虎！"
    },
    {
      "stageNumber": "1-2Hard",
      "stageName": "虎！虎！虎！（困难）"
    },
    {
      "stageNumber": "1-3",
      "stageName": "燃烧的军港"
    },
    {
      "stageNumber": "1-3Hard",
      "stageName": "燃烧的军港（困难）"
    },
    {
      "stageNumber": "1-4",
      "stageName": "来自东方的舰队"
    },
    {
      "stageNumber": "1-4Hard",
      "stageName": "来自东方的舰队（困难）"
    },
    {
      "stageNumber": "2-1",
      "stageName": "支援图拉岛"
    },
    {
      "stageNumber": "2-1Hard",
      "stageName": "支援图拉岛（困难）"
    },
    {
      "stageNumber": "2-2",
      "stageName": "乌云蔽日"
    },
    {
      "stageNumber": "2-2Hard",
      "stageName": "乌云蔽日（困难）"
    },
    {
      "stageNumber": "2-3",
      "stageName": "珊瑚海的首秀"
    },
    {
      "stageNumber": "2-3Hard",
      "stageName": "珊瑚海的首秀（困难）"
    },
    {
      "stageNumber": "2-4",
      "stageName": "救援约克城"
    },
    {
      "stageNumber": "2-4Hard",
      "stageName": "救援约克城（困难）"
    },
    {
      "stageNumber": "3-1",
      "stageName": "决战中途岛！"
    },
    {
      "stageNumber": "3-1Hard",
      "stageName": "决战中途岛！（困难）"
    },
    {
      "stageNumber": "3-2",
      "stageName": "命运的五分钟"
    },
    {
      "stageNumber": "3-2Hard",
      "stageName": "命运的五分钟（困难）"
    },
    {
      "stageNumber": "3-3",
      "stageName": "背水一战"
    },
    {
      "stageNumber": "3-3Hard",
      "stageName": "背水一战（困难）"
    },
    {
      "stageNumber": "3-4",
      "stageName": "最后的反击"
    },
    {
      "stageNumber": "3-4Hard",
      "stageName": "最后的反击（困难）"
    },
    {
      "stageNumber": "4-1",
      "stageName": "午夜惊魂"
    },
    {
      "stageNumber": "4-1Hard",
      "stageName": "午夜惊魂（困难）"
    },
    {
      "stageNumber": "4-2",
      "stageName": "血色黎明"
    },
    {
      "stageNumber": "4-2Hard",
      "stageName": "血色黎明（困难）"
    },
    {
      "stageNumber": "4-3",
      "stageName": "东所罗门遭遇战"
    },
    {
      "stageNumber": "4-3Hard",
      "stageName": "东所罗门遭遇战（困难）"
    },
    {
      "stageNumber": "4-4",
      "stageName": "复仇之战"
    },
    {
      "stageNumber": "4-4Hard",
      "stageName": "复仇之战（困难）"
    },
    {
      "stageNumber": "5-1",
      "stageName": "物资拦截战"
    },
    {
      "stageNumber": "5-1Hard",
      "stageName": "物资拦截战（困难）"
    },
    {
      "stageNumber": "5-2",
      "stageName": "圣克鲁斯的天空"
    },
    {
      "stageNumber": "5-2Hard",
      "stageName": "圣克鲁斯的天空（困难）"
    },
    {
      "stageNumber": "5-3",
      "stageName": "大黄蜂的陨落"
    },
    {
      "stageNumber": "5-3Hard",
      "stageName": "大黄蜂的陨落（困难）"
    },
    {
      "stageNumber": "5-4",
      "stageName": "撤离战区"
    },
    {
      "stageNumber": "5-4Hard",
      "stageName": "撤离战区（困难）"
    },
    {
      "stageNumber": "6-1",
      "stageName": "夜战精英"
    },
    {
      "stageNumber": "6-1Hard",
      "stageName": "夜战精英（困难）"
    },
    {
      "stageNumber": "6-2",
      "stageName": "反攻"
    },
    {
      "stageNumber": "6-2Hard",
      "stageName": "反攻（困难）"
    },
    {
      "stageNumber": "6-3",
      "stageName": "巨炮最后的对决"
    },
    {
      "stageNumber": "6-3Hard",
      "stageName": "巨炮最后的对决（困难）"
    },
    {
      "stageNumber": "6-4",
      "stageName": "所罗门的噩梦"
    },
    {
      "stageNumber": "6-4Hard",
      "stageName": "所罗门的噩梦（困难）"
    },
    {
      "stageNumber": "7-1",
      "stageName": "增援拦截"
    },
    {
      "stageNumber": "7-1Hard",
      "stageName": "增援拦截（困难）"
    },
    {
      "stageNumber": "7-2",
      "stageName": "短兵相接"
    },
    {
      "stageNumber": "7-2Hard",
      "stageName": "短兵相接（困难）"
    },
    {
      "stageNumber": "7-3",
      "stageName": "措手不及"
    },
    {
      "stageNumber": "7-3Hard",
      "stageName": "措手不及（困难）"
    },
    {
      "stageNumber": "7-4",
      "stageName": "预料外的混乱"
    },
    {
      "stageNumber": "7-4Hard",
      "stageName": "预料外的混乱（困难）"
    },
    {
      "stageNumber": "8-1",
      "stageName": "寒风"
    },
    {
      "stageNumber": "8-1Hard",
      "stageName": "寒风（困难）"
    },
    {
      "stageNumber": "8-2",
      "stageName": "北极圈的拂晓"
    },
    {
      "stageNumber": "8-2Hard",
      "stageName": "北极圈的拂晓（困难）"
    },
    {
      "stageNumber": "8-3",
      "stageName": "冰海怒涛"
    },
    {
      "stageNumber": "8-3Hard",
      "stageName": "冰海怒涛（困难）"
    },
    {
      "stageNumber": "8-4",
      "stageName": "被遗忘的战场"
    },
    {
      "stageNumber": "8-4Hard",
      "stageName": "被遗忘的战场（困难）"
    },
    {
      "stageNumber": "9-1",
      "stageName": "不祥之夜"
    },
    {
      "stageNumber": "9-1Hard",
      "stageName": "不祥之夜（困难）"
    },
    {
      "stageNumber": "9-2",
      "stageName": "拦截作战"
    },
    {
      "stageNumber": "9-2Hard",
      "stageName": "拦截作战（困难）"
    },
    {
      "stageNumber": "9-3",
      "stageName": "黑夜中的光芒"
    },
    {
      "stageNumber": "9-3Hard",
      "stageName": "黑夜中的光芒（困难）"
    },
    {
      "stageNumber": "9-4",
      "stageName": "海伦娜"
    },
    {
      "stageNumber": "9-4Hard",
      "stageName": "海伦娜（困难）"
    },
    {
      "stageNumber": "10-1",
      "stageName": "再次出击，再次！"
    },
    {
      "stageNumber": "10-1Hard",
      "stageName": "再次出击，再次！（困难）"
    },
    {
      "stageNumber": "10-2",
      "stageName": "先发制人"
    },
    {
      "stageNumber": "10-2Hard",
      "stageName": "先发制人（困难）"
    },
    {
      "stageNumber": "10-3",
      "stageName": "乘胜追击"
    },
    {
      "stageNumber": "10-3Hard",
      "stageName": "乘胜追击（困难）"
    },
    {
      "stageNumber": "10-4",
      "stageName": "回马枪"
    },
    {
      "stageNumber": "10-4Hard",
      "stageName": "回马枪（困难）"
    },
    {
      "stageNumber": "11-1",
      "stageName": "拂晓登陆！"
    },
    {
      "stageNumber": "11-1Hard",
      "stageName": "拂晓登陆！（困难）"
    },
    {
      "stageNumber": "11-2",
      "stageName": "暴风雨之夜"
    },
    {
      "stageNumber": "11-2Hard",
      "stageName": "暴风雨之夜（困难）"
    },
    {
      "stageNumber": "11-3",
      "stageName": "所罗门四骑士"
    },
    {
      "stageNumber": "11-3Hard",
      "stageName": "所罗门四骑士（困难）"
    },
    {
      "stageNumber": "11-4",
      "stageName": "撕裂黑夜！"
    },
    {
      "stageNumber": "11-4Hard",
      "stageName": "撕裂黑夜！（困难）"
    },
    {
      "stageNumber": "12-1",
      "stageName": "先声夺人"
    },
    {
      "stageNumber": "12-1Hard",
      "stageName": "先声夺人（困难）"
    },
    {
      "stageNumber": "12-2",
      "stageName": "鲁莽的后果"
    },
    {
      "stageNumber": "12-2Hard",
      "stageName": "鲁莽的后果（困难）"
    },
    {
      "stageNumber": "12-3",
      "stageName": "空中对决"
    },
    {
      "stageNumber": "12-3Hard",
      "stageName": "空中对决（困难）"
    },
    {
      "stageNumber": "12-4",
      "stageName": "TF58，翱翔于天际"
    },
    {
      "stageNumber": "12-4Hard",
      "stageName": "TF58，翱翔于天际（困难）"
    },
    {
      "stageNumber": "13-1",
      "stageName": "激战的长空"
    },
    {
      "stageNumber": "13-1Hard",
      "stageName": "激战的长空（困难）"
    },
    {
      "stageNumber": "13-2",
      "stageName": "羽栖之鹤"
    },
    {
      "stageNumber": "13-2Hard",
      "stageName": "羽栖之鹤（困难）"
    },
    {
      "stageNumber": "13-3",
      "stageName": "奋起之鹤"
    },
    {
      "stageNumber": "13-3Hard",
      "stageName": "奋起之鹤（困难）"
    },
    {
      "stageNumber": "13-4",
      "stageName": "起舞之凤"
    },
    {
      "stageNumber": "13-4Hard",
      "stageName": "起舞之凤（困难）"
    },
    {
      "stageNumber": "14-1",
      "stageName": "夜间遭遇"
    },
    {
      "stageNumber": "14-2",
      "stageName": "T字对决"
    },
    {
      "stageNumber": "14-3",
      "stageName": "缠斗"
    },
    {
      "stageNumber": "14-4",
      "stageName": "晨曦下的追击"
    },
    {
      "stageNumber": "15-1",
      "stageName": "破晓突袭"
    },
    {
      "stageNumber": "15-2",
      "stageName": "胜券在握"
    },
    {
      "stageNumber": "15-3",
      "stageName": "紧急求援"
    },
    {
      "stageNumber": "15-4",
      "stageName": "笼中之鹤"
    },
  ];


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
    let lastState = '';
    // 记录请求次数
    let requestedCount = 0;

    function makeRequest() {
      https.get(options, (response) => {
        let chunks = [];

        // 接收数据
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        // 接收完数据后，解析网页信息
        response.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const jsonData = JSON.parse(data);
          // logger.info('jsonData:', jsonData);
          const items = jsonData.data?.items || [];

          // logger.info('items:', items);
          // fs.writeFile('items.json', JSON.stringify(items), (err) => {
          //   if (err) throw err;
          //   logger.success('items.json 文件已保存');
          // });

          if (items.length > 0) {
            const firstItem = items.find(item => (item?.modules?.module_tag?.text ?? "") !== "置顶") || null;

            // logger.info('firstItem:', firstItem);

            const modules = firstItem.modules?.module_dynamic || {};
            const major = modules.major || {};
            const desc = major.archive?.desc || "";
            const pics = modules.major?.draw?.items || [];
            let text = modules.desc?.text ?? "";
            const title = major.archive?.title || "";
            const bvid = major.archive?.bvid || "";
            const cover = major.archive?.cover || "";

            let result = text ? `${shouldConvertTextToImage ? text.replace(/#/, '# #') : text}\n\n` : '';
            if (pics.length > 0) {
              pics.forEach((pic, index) => {
                result += shouldConvertTextToImage ? `![pic${index + 1}](${pic.src})\n\n` : `${h.image(pic.src)}\n\n`;
              });
            }
            // 构建要发送的文本信息
            if (bvid) {
              result += shouldConvertTextToImage ? `# 标题：${title}\n# BVID：${bvid}\n# 详情：\n${desc}...\n` : `标题：${title}\nBVID：${bvid}\n\n详情：${desc}...\n\n`;
            }
            result = result.trim();
            if (cover) {
              // 发送封面图片
              if (shouldConvertTextToImage) {
                result = `![cover](${cover})\n\n${result}`;
              } else {
                result = `${h.image(cover)}\n\n${result}`;
              }

            }

            const state = result
            // 处理时间信息
            if (shouldIncludeTimeInDynamicPush) {
              const currentTime: Date = new Date();
              const beijingTime: string = currentTime.toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"});
              result = shouldConvertTextToImage ? `# ${beijingTime}\n\n${result}` : `${beijingTime}\n\n${result}`;
            }

            // 如果需要将文本转换为图片
            if (shouldConvertTextToImage) {
              const lines = result.split('\n');
              result = lines
                .map((line) => (line.trim() !== '' && line[0] !== '#' ? `## ${line}` : line))
                .join('\n');
            }

            // logger.info(result);
            // 发送信息
            let isPush: boolean = false;
            if (state !== lastState) {
              for (const currentBot of ctx.bots) {
                for (const groupId of pushGroupIDs) {
                  if (isInitialOfficialAccountUpdate || requestedCount !== 0) {
                    isPush = true;
                    if (shouldConvertTextToImage) {
                      const imageBuffer = await ctx.markdownToImage.convertToImage(result);
                      await currentBot.sendMessage(groupId, `${h.image(imageBuffer, `image/${imageType}`)}${shouldIncludeAzurLaneBilibiliLinkAfterPush ? '\nhttps://space.bilibili.com/233114659/dynamic' : ''}`);
                    } else {
                      await currentBot.sendMessage(groupId, result);
                    }
                  }
                }
                for (const userId of pushUserIDs) {
                  if (isInitialOfficialAccountUpdate || requestedCount !== 0) {
                    isPush = true;
                    const channel = await currentBot.createDirectChannel(userId);
                    if (shouldConvertTextToImage) {
                      const imageBuffer = await ctx.markdownToImage.convertToImage(result);
                      await currentBot.sendMessage(channel.id, `${h.image(imageBuffer, `image/${imageType}`)}${shouldIncludeAzurLaneBilibiliLinkAfterPush ? '\nhttps://space.bilibili.com/233114659/dynamic' : ''}`);
                    } else {
                      await currentBot.sendMessage(channel.id, result);
                    }
                  }
                }
              }
              lastState = state;
              if (isPush === true) logger.success(`最新动态推送成功！`);
            }

            ++requestedCount;
          } else {
            // logger.error('返回数据中没有 items，正在等待动态更新！');
          }
        });
      }).on('error', (err) => {
        logger.error('发生错误，请手动偷瞄一次碧蓝航线B站官方动态页（https://space.bilibili.com/233114659/dynamic）：', err);
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

    const exitListener = () => stopRequest();

    if (process.listenerCount('exit') === 0) {
      process.on('exit', exitListener);
    }

    if (process.listenerCount('SIGINT') === 0) {
      process.on('SIGINT', exitListener);
    }

    if (process.listenerCount('SIGTERM') === 0) {
      process.on('SIGTERM', exitListener);
    }

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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
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
          await context.close()
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
          return `序号 ${index} 超出范围（1~${shipGirls.length}）。`;
        }
      } else {
        selectedShipGirl = shipGirls.find((girl) => girl.name === indexOrName);
        if (!selectedShipGirl) selectedShipGirl = shipGirls.find((girl) => girl.title === indexOrName);
        if (!selectedShipGirl) {
          return `未找到舰娘：${indexOrName}。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selectedShipGirl.title}`;
      const page = await ctx.puppeteer.page()
      await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});
      await page.goto(url, {waitUntil: 'load'});
      await page.waitForSelector('.mw-parser-output');

      await page.evaluate(() => {
        const modifyCollapsedElements = () => {
          const collapsedElements = document.querySelectorAll('.panel-collapse.collapse:not(.in)');
          collapsedElements.forEach(element => {
            element.classList.add('in');
            element.setAttribute('aria-expanded', 'true');
          });
        };

        const modifyTabElements = () => {
          const elements = document.querySelectorAll('div[role="tabpanel"].tab-pane, li[role="presentation"]');
          elements.forEach((element) => {
            element.classList.add('active');
          });
        };

        const removeElements = () => {
          const elementsToDelete = document.querySelectorAll('.wiki-nav.hidden-xs.wiki-nav-celling, .bread.mwiki_hide, .bread, .qchar-container, div.sm-bar, span.badge.pull-right, div.mw-references-wrap, div.panel.panel-shiptable, .alert.alert-danger, .wiki-nav.hidden-xs');
          elementsToDelete.forEach(element => element.remove());
        };

        const removeCanvasElements = () => {
          const canvasElements = document.querySelectorAll('canvas[data-type="canvas"]');
          canvasElements.forEach(el => el.remove());
        };

        const modifyTableWidth = () => {
          const tableElements = document.querySelectorAll('th:has(table.wikitable.sv-breakthrough)');
          // @ts-ignore
          tableElements.forEach(el => el.style.width = '100%');
        };

        const modifyActiveTabs = () => {
          const tabElements = document.querySelectorAll('.TabContainer .tab_li:not(.active), .TabContainer .tab_con:not(.active)');
          tabElements.forEach(el => el.classList.add('active'));
        };

        const elements = document.querySelectorAll('div[style*="max-height"]');
        elements.forEach(element => {
          element.removeAttribute('style');
        });

        modifyCollapsedElements();
        modifyTabElements();
        removeElements();
        removeCanvasElements();
        modifyTableWidth();
        modifyActiveTabs();

        const otherShipSection = document.querySelector('a[href="#其它舰船"]');
        // @ts-ignore
        if (otherShipSection) otherShipSection.parentNode.remove();

        const otherShipHeader = document.querySelector('h2 span.mw-headline#其它舰船');
        // @ts-ignore
        if (otherShipHeader) otherShipHeader.parentNode.remove();

        const removeHeimuClass = () => {
          const heimuElements = document.querySelectorAll('span.heimu');
          heimuElements.forEach(el => el.removeAttribute('class'));
        };

        removeHeimuClass();
      });

      const element = await page.$('.mw-parser-output');
      const imageBuffer = await element.screenshot({type: imageType});
      // fs.writeFile(`shipGirlImage2.${imageType}`, imageBuffer, (err) => {
      //   if (err) throw err;
      //   logger.success(`shipGirlImage2.${imageType} 文件已保存。`);
      // });
      await session.send(h.image(imageBuffer, `image/${imageType}`))

      await page.close()
      //
    });

  // 舰娘.立绘* jnlh*
  ctx.command('azurLaneAssistant.舰娘.立绘 [indexOrName:text]', '查询舰娘立绘')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询立绘的【舰娘名】或【序号】或【取消】：`);
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
          return `序号 ${index} 超出范围（1~${shipGirls.length}）。`;
        }
      } else {
        selectedShipGirl = shipGirls.find((girl) => girl.name === indexOrName);
        if (!selectedShipGirl) selectedShipGirl = shipGirls.find((girl) => girl.title === indexOrName);
        if (!selectedShipGirl) {
          return `未找到立绘：${indexOrName}。`;
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
          const $ = load(data);

          interface Illustration {
            nameNoFileExtension: string;
            src: string;
            imgString: string;
          }

          const illustrations: Illustration[] = [];

          $('.tab_con img').each((index, element) => {
            const name = $(element).attr('alt'); // 去除文件名后缀后的立绘名字
            const nameNoFileExtension = removeFileExtension(name)
            const src = $(element).attr('src');
            const imgString = $.html(element); // 获取 img 标签的字符串形式

            illustrations.push({nameNoFileExtension, src, imgString});
          })

          const batchCount = 1
          const illustrationsLength = illustrations.length;
          const batchSize = Math.floor(illustrationsLength / batchCount); // 每批处理的数量
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
          <title>舰娘立绘</title>
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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= illustrationsLength; i++) {
            const illustration = illustrations[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="id">${selectedShipGirl.name}</div>
                    <div class="command">${serialNumber++}. ${illustration.nameNoFileExtension}</div>
                </div>
                <div class="line2">
                    <div class="title">${illustration.imgString}</div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === illustrationsLength)) {
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
          await page.close();
          await context.close()

          await session.send(`请输入待提取的【立绘名】或【序号】：
支持输入多个（用空格隔开）
例如：1 2`)
          const userInput = await session.prompt()
          if (!userInput) return `输入超时。`
          const stringArray = userInput.split(' ');

          for (const element of stringArray) {

            let selectedIllustration: Illustration;
            if (!isNaN(Number(element))) {
              const index = parseInt(element);
              if (index > 0 && index <= illustrations.length) {
                selectedIllustration = illustrations[index - 1];
              } else {
                await session.send(`序号 ${index} 超出范围（1~${illustrations.length}）。`);
                continue;
              }
            } else {
              selectedIllustration = illustrations.find((illustration) => illustration.nameNoFileExtension === element);
              if (!selectedIllustration) {
                await session.send(`未找到立绘：${element}。`);
                continue;
              }
            }
            await session.send(h.image(selectedIllustration.src))
            //
          }
        });
      }).on('error', (err) => {
        logger.error('请求失败：', err.message);
      });
      //
    });

  // 舰娘.语音* jnyy*
  ctx.command('azurLaneAssistant.舰娘.语音 [indexOrName:text]', '查询舰娘语音')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询立绘的【舰娘名】或【序号】或【取消】：`);
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
          return `序号 ${index} 超出范围（1~${shipGirls.length}）。`;
        }
      } else {
        selectedShipGirl = shipGirls.find((girl) => girl.name === indexOrName);
        if (!selectedShipGirl) selectedShipGirl = shipGirls.find((girl) => girl.title === indexOrName);
        if (!selectedShipGirl) {
          return `未找到语音：${indexOrName}。`;
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
          const $ = load(data);

          interface ShipWord {
            tableName: string;
            dataKey: string;
            shipWordLine: string;
            audioSrc: string;
          }

          const shipWords: ShipWord[] = [];

          $('div.sm-bar').each((index, element) => {
            const shipWordLine = $(element).prev('.ship_word_line').text().trim();
            const audioSrc = $(element).find('.sm-audio-src a').attr('href') || '';
            const dataKey = $(element).closest('tr').find('th').text().trim();
            const tableName = $(element).closest('.table-ShipWordsTable').attr('data-title') || '舰船台词';

            const shipWord: ShipWord = {
              tableName,
              dataKey,
              shipWordLine,
              audioSrc
            };

            shipWords.push(shipWord);
          });

          const batchCount = 1
          const shipWordsLength = shipWords.length;
          const batchSize = Math.floor(shipWordsLength / batchCount); // 每批处理的数量
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
          <title>舰娘台词</title>
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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= shipWordsLength; i++) {
            const shipWord = shipWords[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="id">${selectedShipGirl.name}</div>
                    <div class="command">${serialNumber++}. ${shipWord.tableName}-${shipWord.dataKey}</div>
                </div>
                <div class="line2">
                    <div class="title">${shipWord.shipWordLine}</div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === shipWordsLength)) {
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
          await page.close();
          await context.close()

          await session.send(`请输入待提取的【语音名】或【序号】：
支持输入多个（用空格隔开）
例如：1 2`)
          const userInput = await session.prompt()
          if (!userInput) return `输入超时。`
          const stringArray = userInput.split(' ');

          for (const element of stringArray) {

            let selectedShipWord: ShipWord;
            if (!isNaN(Number(element))) {
              const index = parseInt(element);
              if (index > 0 && index <= shipWords.length) {
                selectedShipWord = shipWords[index - 1];
              } else {
                await session.send(`序号 ${index} 超出范围（1~${shipWords.length}）。`);
                continue;
              }
            } else {
              selectedShipWord = shipWords.find((shipWord) => `${shipWord.tableName}-${shipWord.dataKey}` === element);
              if (!selectedShipWord) {
                await session.send(`未找到语音：${element}。`);
                continue;
              }
            }
            await session.send(h.audio(selectedShipWord.audioSrc))
            //
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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
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
          await context.close()
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
          return `序号 ${index} 超出范围（1~${equipments.length}）。`;
        }
      } else {
        selecteEquipment = equipments.find((equipment) => equipment.name === indexOrName);
        if (!selecteEquipment) selecteEquipment = equipments.find((equipment) => equipment.title === indexOrName);
        if (!selecteEquipment) {
          return `未找到装备：${indexOrName}。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selecteEquipment.title.replace(/ /g, '_')}`;
      https.get(url, (res) => {
        let chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const $ = load(data);

          // 获取包含 style 属性的元素
          const elementsWithStyle = $('[style]');

          // 删除 max-width:400px 属性
          elementsWithStyle.each((index, element) => {
            const $element = $(element);
            const styleAttr = $element.attr('style');
            if (styleAttr) {
              const updatedStyle = styleAttr.replace(/max-width\s*:\s*400px\s*;?/i, '');
              $element.attr('style', updatedStyle);
            }
          });

          // 删除指定的元素
          $('div.sm-bar, .col-md-4, span.label.label-default, a:contains("文件:")').remove();

          // 删除最后一个 <div class="panel panel-shiptable"> 标签
          $('div.panel.panel-shiptable:last').remove();

          // 将 role="presentation" 的 li 标签的属性设置为 active
          $('li[role="presentation"]').not('.active').addClass('active');

          // 将所有具有 class="tab-pane" 的元素设置为 active
          $('div.tab-pane').addClass('active');

          // 通过锚点文本删除指定的元素
          $('a[href="#装备导航"]').parent().remove();
          $('h2 span.mw-headline#装备导航').parent().remove();

          // 删除指定的两个网页元素
          $('div.mw-parser-output').find('div.bread, div.bread span').remove();

          // 移除带有 class="heimu" 的元素的 class 属性
          $('span.heimu').removeAttr('class');

          // 查找并添加链接的前缀
          $('a[href^="/blhx"]').each((index, element) => {
            const $element = $(element);
            const href = $element.attr('href');
            if (href) {
              $element.attr('href', `https://wiki.biligame.com${href}`);
            }
          });

          // 获取指定标签的内容
          const mwParserOutputContent = $('div.mw-parser-output').html();

          if (mwParserOutputContent) {

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

            const browser = ctx.puppeteer.browser
            const context = await browser.createBrowserContext()
            const page = await context.newPage()

            await page.setViewport({width: 888, height: 0, deviceScaleFactor: 1});

            await page.setContent(html, {waitUntil: 'networkidle2'});

            const imgBuffer = await page.screenshot({fullPage: true, type: imageType});

            await page.close();
            await context.close()
            await session.send(h.image(imgBuffer, `image/${imageType}`))

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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
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
          await context.close()
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
          return `序号 ${index} 超出范围（1~${ranks.length}）。`;
        }
      } else {
        selecteRank = ranks.find((rank) => rank.altWithoutExtension === indexOrName);
        if (!selecteRank) {
          return `未找到榜单：${indexOrName}。`;
        }
      }

      await session.send(h.image(selecteRank.src))
      //
    });

// 关卡* gq*
  ctx.command('azurLaneAssistant.关卡', '查看关卡指令帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant.关卡 -h`)
    })

// 关卡.总览.列表* gqzllb*
  ctx.command('azurLaneAssistant.关卡.总览.列表 [batchCount:number]', '查看关卡总览列表')
    .option('initialize', '-i 初始化关卡列表')
    .action(async ({session, options}, batchCount = defaultStagesListBatchCount) => {
      if (isNaN(batchCount) || batchCount <= 0) {
        return '批次数必须是一个大于 0 的数字！';
      }
      if (batchCount > 10) return `批次数超出范围，最大值为 10。`
      // 请求链接
      const url = 'https://wiki.biligame.com/blhx/%E7%AB%A0%E8%8A%82%E5%85%B3%E5%8D%A1';

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
          let newStages: Stage[] = []
          // 查找并添加链接的前缀
          $('a[href^="/blhx"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
              $(element).attr('href', `https://wiki.biligame.com${href}`);
            }
          });
          // 在网页元素 <div class="mw-parser-output"> 中，遍历每一个 table，提取所需元素添加到一个对象数组中
          $('div.mw-parser-output table').each((index, table) => {
            const title = $(table).find('a[title]').attr('title');
            const name = title.replace(/#.*/, '')
            const href = $(table).find('a[title]').attr('href');
            // const img = $(table).find('img').attr('src');
            const img = $(table).find('img').prop('outerHTML'); // 获取整个 <img> 标签的字符串形式
            const alt = $(table).find("img").attr("alt") || "";
            const altName = alt.substring(0, alt.lastIndexOf(".")) || alt; // 提取文件名部分，不包括后缀

            if (title && href && img) {
              newStages.push({title, name, href, img, altName});
            }
          });
          if (newStages !== stages) stages = newStages
          // logger.log(stages); // 输出对象数组
          // fs.writeFile('shipGirls.json',  JSON.stringify(shipGirls), (err) => {
          //   if (err) throw err;
          //   logger.success('文件已保存');
          // });
          const stagesLength = stages.length;
          const batchSize = Math.floor(stagesLength / batchCount); // 每批处理的数量
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
          <title>关卡列表</title></head>
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

          const browser = ctx.puppeteer.browser
          const context = await browser.createBrowserContext()
          const page = await context.newPage()
          await page.setViewport({width: 100, height: 100});

          for (let i = 1; i <= stagesLength; i++) {
            const stage = stages[i - 1];
            const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="avatar">
                        ${stage.img}
                    </div>
                    <div class="name">${serialNumber++}. ${stage.altName}</div>
                </div>
                <div class="line2">
                    <div class="tags">${stage.name}</div>
                </div>
            </td>
        </tr>
      `;
            tableRows.push(row);

            if ((i % batchSize === 0 || i === stagesLength) && !options.initialize) {
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
          if (options.initialize) logger.success(`关卡总览列表初始化成功！`)
          await page.close();
          await context.close()
        });

      }).on("error", (error) => {
        logger.error("请求出错：", error.message);
      });

      //
    })
    .execute({options: {initialize: true}})

// 关卡.总览.查询* gqzlcx*
  ctx.command('azurLaneAssistant.关卡.总览.查询 [indexOrName:text]', '查询关卡总览信息')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询的【关卡名】或【序号】或【取消】：`);
        const userInput = await session.prompt();
        if (!userInput) return `输入超时。`;
        if (userInput === '取消') return `本次查询已取消。`;
        indexOrName = userInput;
      }
      let selectedStage: Stage;
      if (!isNaN(Number(indexOrName))) {
        const index = parseInt(indexOrName);
        if (index > 0 && index <= stages.length) {
          selectedStage = stages[index - 1];
        } else {
          return `序号 ${index} 超出范围（1~${stages.length}）。`;
        }
      } else {
        selectedStage = stages.find((stage) => stage.altName === indexOrName);
        if (!selectedStage) selectedStage = stages.find((stage) => stage.title === indexOrName);
        if (!selectedStage) selectedStage = stages.find((stage) => stage.name === indexOrName);
        if (!selectedStage) {
          return `未找到关卡：${indexOrName}。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selectedStage.title}`;
      const page = await ctx.puppeteer.page()
      await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});
      await page.goto(url, {waitUntil: 'networkidle0'});
      await page.waitForSelector('.mw-parser-output');

      await page.evaluate(() => {

        const lis = document.querySelectorAll('.tabbernav > li');
        lis.forEach(li => {
          if (!li.classList.contains('tabberactive')) {
            li.classList.add('tabberactive');
          }
        });

        // 获取所有 class 为 "tabbertab" 的 div 元素
        const tabberTabs = document.querySelectorAll('.tabbertab');

        // 遍历每个 tabberTab 元素
        tabberTabs.forEach(tabberTab => {
          // 获取元素的 style 属性值
          const style = tabberTab.getAttribute('style');

          // 如果 style 包含 display: none;，则移除它
          if (style && style.includes('display: none;')) {
            tabberTab.setAttribute('style', style.replace('display: none;', ''));
          }
        });

        const elements = document.querySelectorAll('div[style*="max-height"]');
        elements.forEach(element => {
          element.removeAttribute('style');
        });

        const removeElements = () => {
          const elementsToDelete = document.querySelectorAll('.wiki-nav.hidden-xs.wiki-nav-celling, .bread.mwiki_hide, .bread, .qchar-container, div.sm-bar, span.badge.pull-right, div.mw-references-wrap, div.panel.panel-shiptable, .alert.alert-danger, .wiki-nav.hidden-xs, .alert.alert-info[role="alert"], dl dd, div.dbxx, ul>li>dl>dt, table[style="float:left;margin:5px;text-align:center;"]');
          elementsToDelete.forEach(element => element.remove());
        };
        removeElements();

        const modifyCollapsedElements = () => {
          const collapsedElements = document.querySelectorAll('.panel-collapse.collapse:not(.in)');
          collapsedElements.forEach(element => {
            element.classList.add('in');
            element.setAttribute('aria-expanded', 'true');
          });
        };
        modifyCollapsedElements();
        const modifyTabElements = () => {
          const elements = document.querySelectorAll('div[role="tabpanel"].tab-pane, li[role="presentation"]');
          elements.forEach((element) => {
            element.classList.add('active');
          });
        };
        modifyTabElements();
        const otherShipSection = document.querySelector('a[href="#章节关卡"]');
        // @ts-ignore
        if (otherShipSection) otherShipSection.parentNode.remove();

        const headersToRemove = [
          'h2 span.mw-headline#章节关卡',
          'h3 span.mw-headline#常规关卡',
          'h3 span.mw-headline#大型活动关卡E\\.X\\.',
          'h3 span.mw-headline#小型活动关卡S\\.P\\.',
          'h3 span.mw-headline#特殊活动关卡T',
          'h4 span.mw-headline#常规关卡列表',
          'h4 span.mw-headline#困难难度常规关卡',
        ];

        headersToRemove.forEach(selector => {
          const header = document.querySelector(selector);
          // @ts-ignore
          if (header) header.parentNode.remove();
        });

        const removeHeimuClass = () => {
          const heimuElements = document.querySelectorAll('span.heimu');
          heimuElements.forEach(el => el.removeAttribute('class'));
        };

        removeHeimuClass();
      });

      const element = await page.$('.mw-parser-output');
      const imageBuffer = await element.screenshot({type: imageType});
      // fs.writeFile(`关卡总览2.${imageType}`, imageBuffer, (err) => {
      //   if (err) throw err;
      //   logger.success(`关卡总览2.${imageType} 文件已保存。`);
      // });
      await session.send(h.image(imageBuffer, `image/${imageType}`))

      await page.close()
      //
    });

// 关卡.主线.列表* gqzxlb*
  ctx.command('azurLaneAssistant.关卡.主线.列表 [batchCount:number]', '查看主线关卡列表')
    .option('initialize', '-i 初始化关卡列表')
    .action(async ({session, options}, batchCount = defaultStagesListBatchCount) => {
      if (isNaN(batchCount) || batchCount <= 0) {
        return '批次数必须是一个大于 0 的数字！';
      }
      if (batchCount > 10) return `批次数超出范围，最大值为 10。`

      const manlineStagesLength = manlineStages.length;
      const batchSize = Math.floor(manlineStagesLength / batchCount); // 每批处理的数量
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
          <title>关卡列表</title></head>
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

      const browser = ctx.puppeteer.browser
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({width: 100, height: 100});

      for (let i = 1; i <= manlineStagesLength; i++) {
        const manlineStage = manlineStages[i - 1];
        const row = `
        <tr>
            <td>
                <div class="line1">
                    <div class="id">${manlineStage.stageNumber}</div>
                    <div class="name">${serialNumber++}. ${manlineStage.stageName}</div>
                </div>
                <div class="line2">
                    <div class="tags"></div>
                </div>
            </td>
        </tr>
      `;
        tableRows.push(row);

        if ((i % batchSize === 0 || i === manlineStagesLength) && !options.initialize) {
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
      if (options.initialize) logger.success(`主线关卡列表初始化成功！`)
      await page.close();
      await context.close()

      //
    })
    .execute({options: {initialize: true}})

// 关卡.主线.查询* gqzxcx*
  ctx.command('azurLaneAssistant.关卡.主线.查询 [indexOrName:text]', '查询主线关卡信息')
    .action(async ({session}, indexOrName) => {
      if (!indexOrName) {
        await session.send(`请输入待查询的【关卡名】
或【关卡号（例如1-1、1-1Hard）】
或【取消】：`);
        const userInput = await session.prompt();
        if (!userInput) return `输入超时。`;
        if (userInput === '取消') return `本次查询已取消。`;
        indexOrName = userInput;
      }
      let selectedMainlineStage: mainlineStage;
      if (!isNaN(Number(indexOrName))) {
        const index = parseInt(indexOrName);
        if (index > 0 && index <= manlineStages.length) {
          selectedMainlineStage = manlineStages[index - 1];
        } else {
          return `序号 ${index} 超出范围（1~${manlineStages.length}）。`;
        }
      } else {
        selectedMainlineStage = manlineStages.find((mainlineStage) => mainlineStage.stageNumber === indexOrName);
        if (!selectedMainlineStage) selectedMainlineStage = manlineStages.find((mainlineStage) => mainlineStage.stageName === indexOrName);
        if (!selectedMainlineStage) {
          return `未找到关卡：${indexOrName}。`;
        }
      }

      const url = `https://wiki.biligame.com/blhx/${selectedMainlineStage.stageNumber}`;
      https.get(url, (res) => {
        let chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const data = iconv.decode(buffer, 'utf-8');
          const $ = load(data);

          // 删除表格中的 max-height 属性
          $('div[style*="max-height"]').removeAttr('style');
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
    <title>主线关卡攻略</title>
    <style>
    .ship_word_line, th {
      display: inline-block;
      vertical-align: middle;
    }
    </style>

    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.MobileDetect.mobileonly%7Cext.visualEditor.desktopArticleTarget.noscript%7Cskins.vector.styles.legacy&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.smw.style%7Cext.smw.tooltip.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=ext.srf.styles&amp;only=styles&amp;skin=vector"/>
    <link rel="stylesheet"
        href="https://wiki.biligame.com/blhx/load.php?lang=zh-cn&amp;modules=site.styles&amp;only=styles&amp;skin=vector"/>
</head>
<body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-${selectedMainlineStage.stageNumber} rootpage-${selectedMainlineStage.stageNumber} skin-vector action-view skin-vector-legacy">
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

            const browser = ctx.puppeteer.browser
            const context = await browser.createBrowserContext()
            const page = await context.newPage()

            await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});

            await page.setContent(html, {waitUntil: 'networkidle2'});

            const imgBuffer = await page.screenshot({fullPage: true, type: imageType});

            await page.close();
            await context.close()
            await session.send(h.image(imgBuffer, `image/${imageType}`))
            // fs.writeFile(`stageImage.${imageType}`, imgBuffer, (err) => {
            //   if (err) throw err;
            //   logger.success(`stageImage.${imageType} 文件已保存。`);
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

// 攻略* gl*
  ctx.command('azurLaneAssistant.攻略', '查看攻略指令帮助')
    .action(async ({session}) => {
      await session.execute(`azurLaneAssistant.攻略 -h`)
    })

// 攻略.月度BOSS解析* glyd*
  ctx.command('azurLaneAssistant.攻略.月度BOSS解析', '查看月度BOSS解析攻略')
    .action(async ({session}) => {

      const url = `https://wiki.biligame.com/blhx/%E5%A4%A7%E5%9E%8B%E4%BD%9C%E6%88%98%E6%9C%88%E5%BA%A6BOSS%E8%A7%A3%E6%9E%90`
      const page = await ctx.puppeteer.page()
      await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});
      await page.goto(url, {waitUntil: 'load'});
      await page.waitForSelector('.mw-parser-output');

      await page.evaluate(() => {
        const modifyCollapsedElements = () => {
          const collapsedElements = document.querySelectorAll('.panel-collapse.collapse:not(.in)');
          collapsedElements.forEach(element => {
            element.classList.add('in');
            element.setAttribute('aria-expanded', 'true');
          });
        };
        modifyCollapsedElements();
        const removeElements = () => {
          const elementsToDelete = document.querySelectorAll('.wiki-nav.hidden-xs.wiki-nav-celling, .bread.mwiki_hide, .bread, .qchar-container, div.sm-bar, span.badge.pull-right, div.mw-references-wrap, div.panel.panel-shiptable, .alert.alert-danger, .wiki-nav.hidden-xs');
          elementsToDelete.forEach(element => element.remove());
        };

        removeElements();
      });
      const element = await page.$('.mw-parser-output');
      const imageBuffer = await element.screenshot({type: imageType});
      await session.send(h.image(imageBuffer, `image/${imageType}`))
      // fs.writeFile(`月度BOSS.${imageType}`, imageBuffer, (err) => {
      //   if (err) throw err;
      //   logger.success(`月度BOSS.${imageType} 文件已保存。`);
      // });
      await page.close()
      //
    });

// 攻略.余烬BOSS攻略要点* 攻略.METAboss攻略要点* glyj*
  ctx.command('azurLaneAssistant.攻略.余烬BOSS攻略要点', '查看余烬BOSS攻略要点')
    .action(async ({session}) => {

      const url = `https://wiki.biligame.com/blhx/METAboss%E6%94%BB%E7%95%A5%E8%A6%81%E7%82%B9`;
      const page = await ctx.puppeteer.page()
      await page.setViewport({width: 0, height: 0, deviceScaleFactor: 1});
      await page.goto(url, {waitUntil: 'load'});
      await page.waitForSelector('.mw-parser-output');

      await page.evaluate(() => {
        const collapsedElements = document.querySelectorAll('.panel-collapse.collapse:not(.in)');
        collapsedElements.forEach(element => {
          element.classList.add('in');
          element.setAttribute('aria-expanded', 'true');
        });
        const modifyTabElements = () => {
          const elements = document.querySelectorAll('div[role="tabpanel"].tab-pane, li[role="presentation"]');
          elements.forEach((element) => {
            element.classList.add('active');
          });
        };
        modifyTabElements();
        const removeElements = () => {
          const elementsToDelete = document.querySelectorAll('.wiki-nav.hidden-xs.wiki-nav-celling, .bread.mwiki_hide, .bread, .qchar-container, div.sm-bar, span.badge.pull-right, div.mw-references-wrap, div.panel.panel-shiptable, .alert.alert-danger, .wiki-nav.hidden-xs');
          elementsToDelete.forEach(element => element.remove());
        };
        removeElements();
      });

      const element = await page.$('.mw-parser-output');
      const imageBuffer = await element.screenshot({type: imageType});
      await session.send(h.image(imageBuffer, `image/${imageType}`))
      // fs.writeFile(`余烬BOSS.${imageType}`, imageBuffer, (err) => {
      //   if (err) throw err;
      //   logger.success(`余烬BOSS.${imageType} 文件已保存。`);
      // });
      await page.close()
      //
    });
}

function removeFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return filename; // 如果文件名中没有点，则返回原文件名
  } else {
    return filename.substring(0, lastDotIndex); // 返回去除后缀名的文件名部分
  }
}
