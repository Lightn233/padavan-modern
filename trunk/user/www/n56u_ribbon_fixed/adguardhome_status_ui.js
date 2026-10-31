/* 服务状态独立刷新，不覆盖页面上尚未应用的开关或 DNS 选择。 */
(function () {
    'use strict';
    var timer = null, request = null, stopped = false;
    function endpoint(data) {
        var web = data.web, current = new URL(location.href), host;
        if (!web || !web.known || !web.listening || !Number.isInteger(web.port) || web.port < 1 || web.port > 65535 ||
            (web.scheme !== 'http' && web.scheme !== 'https')) return '';
        host = web.host;
        if (host === '0.0.0.0' || host === '::') {
            // 数字 IPv4 使用当前 br0 地址；域名和 IPv6 沿用正在访问的管理主机。
            host = /^\d+\.\d+\.\d+\.\d+$/.test(current.hostname) && data.lan ? data.lan : current.hostname;
        }
        if (!host || /[\s/@?#%]/.test(host) || host === '127.0.0.1' || host === '::1') return '';
        if (host.indexOf(':') >= 0 && host[0] !== '[') host = '[' + host + ']';
        try { return new URL(web.scheme + '://' + host + ':' + web.port).href; } catch (_) { return ''; }
    }
    function render(data) {
        var link = document.getElementById('agh_web_link'), state = document.getElementById('agh_web_state');
        link.hidden = true; link.removeAttribute('href'); link.textContent = '';
        if (!data) { state.textContent = '暂时无法读取状态，正在重试'; return; }
        if (!data.running) {
            state.textContent = data.mode === 3 ? 'AP 模式下服务未运行，暂无可用管理入口' : 'AdGuard Home 未运行，暂无可用管理入口';
            return;
        }
        var url = endpoint(data);
        if (!url) { state.textContent = '服务进程已运行，WEB 入口尚未就绪或仅限本机访问'; return; }
        link.href = url; link.textContent = url; link.hidden = false;
        state.textContent = '服务运行中 · 自动更新地址';
    }
    function refresh() {
        clearTimeout(timer);
        if (stopped || document.hidden || request) return;
        request = $j.ajax({url:'/adguardhome_status.json',dataType:'json',cache:false,timeout:5000,
            success:render,error:function(){render(null);},complete:function(){request=null;if(!stopped&&!document.hidden)timer=setTimeout(refresh,5000);}});
    }
    window.aghWebRefresh = refresh;
    document.addEventListener('visibilitychange', function () {
        clearTimeout(timer);
        if (document.hidden) { if (request) request.abort(); } else refresh();
    });
    window.addEventListener('pagehide', function () { stopped=true;clearTimeout(timer);if(request)request.abort(); });
    window.addEventListener('pageshow', function () { stopped=false;refresh(); });
}());
