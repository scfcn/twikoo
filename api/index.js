/*!
 * Twikoo vercel function with GeeTest integration
 */

const express = require('express');
const { version: VERSION } = require('../package.json')
const MongoClient = require('mongodb').MongoClient
const getUserIP = require('get-user-ip')
const { URL } = require('url')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto');
const {
  getCheerio,
  getAxios,
  getDomPurify,
  getMd5,
  getSha256,
  getXml2js
} = require('twikoo-func/utils/lib')
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
} = require('twikoo-func/utils')
const {
  jsonParse,
  commentImportValine,
  commentImportDisqus,
  commentImportArtalk,
  commentImportArtalk2,
  commentImportTwikoo
} = require('twikoo-func/utils/import')
const { postCheckSpam } = require('twikoo-func/utils/spam')
const { sendNotice, emailTest } = require('twikoo-func/utils/notify')
const { uploadImage } = require('twikoo-func/utils/image')
const logger = require('twikoo-func/utils/logger')

const app = express();
app.use(express.json());

// 极验行为验证 4.0 配置
const geetestConfig = {
  captcha_id: process.env.GEETEST_CAPTCHA_ID, // 从环境变量获取
  captcha_key: process.env.GEETEST_CAPTCHA_KEY, // 从环境变量获取
  validateUrl: 'https://gcaptcha4.geetest.com/validate'
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

  return true;
}

// ========== 以下为原 Twikoo 代码，添加极验验证逻辑 ==========

const $ = getCheerio()
const axios = getAxios()
const DOMPurify = getDomPurify()
const md5 = getMd5()
const sha256 = getSha256()
const xml2js = getXml2js()

const { RES_CODE, MAX_REQUEST_TIMES } = require('twikoo-func/utils/constants')

let db = null
let config
let accessToken
const requestTimes = {}

// 评论提交接口（集成极验验证）
async function commentSubmit (event, request) {
  const res = {}
  // 参数校验
  validate(event, ['url', 'ua', 'comment'])
  
  // 新增极验验证
  try {
    if (!event.geetestData) {
      throw new Error('缺少极验验证数据')
    }
    await validateGeetest(event.geetestData)
  } catch (e) {
    res.code = RES_CODE.FAIL
    res.message = e.message
    return res
  }

  // 限流
  await limitFilter(request)
  // 其他验证码（如Turnstile）
  await checkCaptcha(event, request)
  
  // 预检测、转换
  const data = await parse(event, request)
  // 保存
  const comment = await save(data)
  res.id = comment.id
  
  // 异步处理
  try {
    logger.log('开始异步处理...')
    await Promise.race([
      axios.post(`https://${process.env.VERCEL_URL}`, {
        event: 'POST_SUBMIT',
        comment
      }, { headers: { 'x-twikoo-recursion': config.ADMIN_PASS || 'true' } }),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ])
  } catch (e) {
    logger.error('异步处理失败', e.message)
  }
  return res
}

// ========== 以下保留原 Twikoo 其他函数不变 ==========
// （包括 connectToDatabase、setPassword、commentGet、commentGetForAdmin 等所有原有函数）
// 注意：需要保留原有全部功能代码，此处限于篇幅省略重复部分

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // 适配 Vercel 函数
