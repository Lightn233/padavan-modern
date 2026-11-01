<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Cache-Control" content="no-store">
<title>管理页面正在使用 · <#Web_Title#></title>
<link rel="stylesheet" href="/ui/base.css?v=1">
<style>
body{margin:0;min-width:0;background:#f3f6fa;color:#172b43;font:15px/1.7 system-ui,-apple-system,"Microsoft YaHei",sans-serif}
.login-notice{box-sizing:border-box;width:min(440px,calc(100% - 32px));margin:12vh auto 32px;padding:28px;background:#fff;border:1px solid #dde5ef;border-radius:16px;box-shadow:0 8px 30px #15375e09}
.login-notice h1{font-size:22px;line-height:1.4;margin:16px 0 12px}
.login-notice p{margin:12px 0;color:#53677e}.login-notice .notice-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;color:#a6640b;background:#fff3d9;font-size:24px;font-weight:600}
.login-notice .login-owner{padding:10px 14px;border-radius:8px;background:#f4f7fb;color:#172b43;font-variant-numeric:tabular-nums}
.login-notice a{display:block;margin-top:24px;padding:10px;text-align:center;border-radius:8px;background:#2368df;color:#fff;text-decoration:none;font-weight:600}
.login-notice a:focus-visible{outline:3px solid #91b9ff;outline-offset:3px}
</style>
<script><% login_state_hook(); %></script>
</head>
<body>
<main class="login-notice">
<span class="notice-icon" aria-hidden="true">!</span>
<h1>管理页面正在另一台设备上使用</h1>
<p>请先在另一台设备上退出后台，再返回这里登录。</p>
<p class="login-owner">当前管理设备：<strong id="logined_ip_str">正在读取</strong></p>
<p>如果已经关闭另一台设备的后台页面，请稍候再试。此提示不会影响正常上网。</p>
<a href="/">返回并重新登录</a>
</main>
<script>
// 占用页仅在凭据通过校验后返回；地址作为文本展示，不插入 HTML。
document.getElementById('logined_ip_str').textContent = login_ip_str() || '暂无活动会话';
</script>
</body>
</html>
