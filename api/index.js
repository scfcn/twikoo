<script src="https://gcaptcha4.geetest.com/static/gt.js"></script>
<script>
  GCAPTCHA.init({
    captcha_id: '你的captcha_id', // 替换为极验后台获取的 captcha_id
    container: '#captcha-container',
    lang: 'zh-cn',
    success: function(data) {
      window.geetestData = data;
    }
  });
</script>
<div id="captcha-container"></div>

<script src="https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js"></script>
<script>
  twikoo.init({
    envId: '你的Vercel环境地址', // 替换为你的 Vercel 环境地址
    el: '#tcomment',
    onSubmit: (data) => {
      if (!window.geetestData) {
        alert('请先完成人机验证');
        return false;
      }
      data.geetestData = window.geetestData;
      return data;
    }
  });
</script>
