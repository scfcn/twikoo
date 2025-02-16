/*! Twikoo vercel function (c) 2020-present iMaeGoo Released under the MIT License. */

const { version: VERSION } = require('../package.json');
const MongoClient = require('mongodb').MongoClient;
const getUserIP = require('get-user-ip');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid'); // 用户 id 生成
const {
  getCheerio,
  getAxios,
  getDomPurify,
  getMd5,
  getSha256,
  getXml2js
} = require('twikoo-func/utils/lib');
const {
  getFuncVersion,
  getUrlQuery,
  getUrlsQuery,
  parseComment,
  parseCommentForAdmin,
  normalizeMail,
  equalsMail,
  getMailMd5,
  getAvatar,
  isQQ,
  addQQMailSuffix,
  getQQAvatar,
  getPasswordStatus,
  preCheckSpam,
  checkTurnstileCaptcha,
  getConfig,
  getConfigForAdmin,
  validate
} = require('twikoo-func/utils');
const {
  jsonParse,
  commentImportValine,
  commentImportDisqus,
  commentImportArtalk,
  commentImportArtalk2,
  commentImportTwikoo
} = require('twikoo-func/utils/import');
const { postCheckSpam } = require('twikoo-func/utils/spam');
const { sendNotice, emailTest } = require('twikoo-func/utils/notify');
const { uploadImage } = require('twikoo-func/utils/image');
const logger = require('twikoo-func/utils/logger');

const $ = getCheerio();
const axios = getAxios();
const DOMPurify = getDomPurify();
const md5 = getMd5();
const sha256 = getSha256();
const xml2js = getXml2js();

// 极验行为验证 4.0 配置
const geetestConfig = {
  captcha_id: '你的captcha_id', // 替换为极验后台获取的 captcha_id
  captcha_key: '你的captcha_key', // 替换为极验后台获取的 captcha_key
  validateUrl: 'https://gcaptcha4.geetest.com/validate' // 极验二次验证接口
};

// 常量 / constants
const { RES_CODE, MAX_REQUEST_TIMES } = require('twikoo-func/utils/constants');

// 全局变量 / variables
let db = null;
let config;
let accessToken;
const requestTimes = {};

module.exports = async (request, response) => {
  const event = request.body || {};
  logger.log('请求 IP：', getIp(request));
  logger.log('请求函数：', event.event);
  logger.log('请求参数：', event);
  let res = {};
  try {
    protect(request);
    accessToken = anonymousSignIn(request);
    await connectToDatabase(process.env.MONGODB_URI);
    await readConfig();
    allowCors(request, response);
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    switch (event.event) {
      case 'COMMENT_SUBMIT':
        res = await commentSubmit(event, request);
        break;
      // 其他事件处理逻辑...
      default:
        if (event.event) {
          res.code = RES_CODE.EVENT_NOT_EXIST;
          res.message = '请更新 Twikoo 云函数至最新版本';
        } else {
          res.code = RES_CODE.NO_PARAM;
          res.message = 'Twikoo 云函数运行正常，请参考 https://twikoo.js.org/frontend.html 完成前端的配置';
          res.version = VERSION;
        }
    }
  } catch (e) {
    logger.error('Twikoo 遇到错误，请参考以下错误信息。如有疑问，请反馈至 https://github.com/twikoojs/twikoo/issues ');
    logger.error('请求参数：', event);
    logger.error('错误信息：', e);
    res.code = RES_CODE.FAIL;
    res.message = e.message;
  }
  if (!res.code && !request.body.accessToken) {
    res.accessToken = accessToken;
  }
  logger.log('请求返回：', res);
  response.status(200).json(res);
};

// 极验二次验证函数
async function validateGeetest(data) {
  const { captcha_id, lot_number, captcha_output, pass_token, gen_time } = data;
  if (captcha_id !== geetestConfig.captcha_id) {
    throw new Error('验证码参数错误');
  }
  const sign_token = crypto.createHmac('sha256', geetestConfig.captcha_key)
    .update(lot_number, 'utf8')
    .digest('hex');
  const response = await axios.get(geetestConfig.validateUrl, {
    params: {
      captcha_id,
      lot_number,
      captcha_output,
      pass_token,
      gen_time,
      sign_token
    }
  });
  if (response.data.result !== 'success') {
    throw new Error('验证码校验失败');
  }
  return true; // 验证成功
}

// 评论提交逻辑
async function commentSubmit(event, request) {
  const res = {};
  validate(event, ['url', 'ua', 'comment']);
  if (event.geetestData) {
    try {
      await validateGeetest(event.geetestData);
    } catch (error) {
      return { code: RES_CODE.FAIL, message: error.message };
    }
  } else {
    return { code: RES_CODE.FAIL, message: '缺少极验验证数据' };
  }
  await limitFilter(request);
  const data = await parse(event, request);
  const comment = await save(data);
  res.id = comment.id;
  try {
    await Promise.race([
      axios.post(`https://${process.env.VERCEL_URL}`, {
        event: 'POST_SUBMIT',
        comment
      }, { headers: { 'x-twikoo-recursion': config.ADMIN_PASS || 'true' } }),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  } catch (e) {
    logger.error('POST_SUBMIT 失败', e.message);
  }
  return res;
}
