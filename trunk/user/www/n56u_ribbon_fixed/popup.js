<% get_flash_time(); %>
<% ui_operation_baseline(); %>

/* 等待流程、网络查询和界面绘制分开。计时只表示经过时间，不冒充任务完成率。 */
(function(root){
    "use strict";
    function Controller(env){
        this.env = env;
        this.generation = 0;
        this.timer = null;
        this.request = null;
        this.active = false;
    }
    Controller.prototype.stop = function(){
        this.active = false;
        ++this.generation;
        if (this.timer !== null) this.env.clearTimeout(this.timer);
        this.timer = null;
        if (this.request) this.request.abort();
        this.request = null;
    };
    Controller.prototype.start = function(options){
        this.stop();
        this.options = options || {};
        this.active = true;
        this.started = this.env.now();
        this.meta = null;
        this.lastPoll = -10000;
        this.lastSample = null;
        this.message = {phase:"submitting", text:this.options.title || "正在提交设置", detail:"请勿重复操作。", percent:null};
        this.tick();
    };
    Controller.prototype.ack = function(meta){
        if (!this.active || !meta || meta.version !== 1) return;
        this.meta = meta;
        if (meta.reboot) this.options.kind = "reboot";
        this.message = {phase:"applying", text:meta.reboot ? "已提交重启请求" : "已保存，正在应用配置", detail:"等待设备返回实际运行状态。", percent:null};
        this.lastPoll = -10000;
        this.draw();
    };
    Controller.prototype.elapsed = function(){
        return Math.max(0, Math.floor((this.env.now() - this.started) / 1000));
    };
    Controller.prototype.draw = function(){
        var view = {};
        for (var key in this.message) view[key] = this.message[key];
        view.elapsed = this.elapsed();
        view.link = this.options.link || "";
        this.env.render(view);
    };
    Controller.prototype.end = function(phase, text, detail, completed){
        if (!this.active) return;
        this.message = {phase:phase, text:text, detail:detail, percent:completed ? 100 : null, terminal:true};
        this.draw();
        this.stop();
        if (completed && this.options.done) {
            var self = this, token = this.generation;
            this.timer = this.env.setTimeout(function(){
                if (token === self.generation) self.options.done();
            }, 800);
        }
    };
    Controller.prototype.accept = function(sample){
        if (!sample || sample.version !== 1 || typeof sample.pending !== "number" || typeof sample.boot !== "string")
            return this.unavailable("无法识别设备状态，正在重试。");
        this.lastSample = this.env.now();
        var o = this.options, meta = this.meta;
        var reboot = o.kind === "reboot" || o.kind === "flash" || (meta && meta.reboot);
        var boot = meta && meta.boot ? meta.boot : o.boot;
        if (reboot) {
            if (!boot || !sample.boot || sample.boot === boot) {
                this.message = {phase:"rebooting", text:o.kind === "flash" ? "等待固件写入和重新启动" : "等待设备重新启动", detail:"当前尚未确认新的启动记录，请勿断电或重复提交。", percent:null};
                return;
            }
            if (o.mode && String(sample.mode) !== String(o.mode))
                return this.end("mismatch", "设备已重启，但工作模式与请求不一致", "请检查实际模式；本页不会自动再次切换。", false);
        } else {
            if (!meta) return;
            if (boot && sample.boot !== boot)
                return this.end("interrupted", "设备在应用配置期间重启", "本页不能确认原操作的结果，请重新查看设置。", false);
            if (!meta.id || !sample.operation)
                return this.end("unverified", "无法核实这次配置应用的完成状态", "状态标识不可用，请返回页面核对；不会按倒计时宣布成功。", false);
            if (sample.operation !== meta.id)
                return this.end("superseded", "检测到后续配置操作", "另一项配置已经提交，请刷新后核对最新设置。", false);
        }
        if (sample.pending !== 0) {
            this.message = {phase:"applying", text:sample.pending < 0 ? "等待后台状态恢复" : "正在应用配置并重启相关服务", detail:"后台操作尚未结束，等待时间不代表完成率。", percent:null};
            return;
        }
        var mask = reboot ? 3 : meta.wifi;
        var radios = [];
        if (mask & 1) radios.push({name:"5 GHz", state:sample.wifi5});
        if (mask & 2) radios.push({name:"2.4 GHz", state:sample.wifi2});
        var unknown = [];
        for (var i=0; i<radios.length; ++i) {
            var radio = radios[i], state = radio.state;
            if (!state || !state.known) { unknown.push(radio.name); continue; }
            if (state.state === 2) {
                var total = Number(state.total), spent = Number(state.elapsed), percent = null, remain = "";
                if (isFinite(total) && total > 0 && total <= 3600 && isFinite(spent) && spent >= 0) {
                    spent = Math.min(spent, total);
                    percent = Math.min(99, Math.floor(spent * 100 / total));
                    remain = "驱动报告剩余约 " + Math.ceil(total - spent) + " 秒。";
                }
                this.message = {phase:"cac", text:radio.name + " 正在进行 DFS 雷达检测", detail:"当前信道 " + state.channel + "，带宽 " + state.width + " MHz。" + remain + "检测结束前不会广播；发现雷达时可能换信道并重新检测。", percent:percent};
                return;
            }
            if (state.state !== 4 && state.state !== 5) {
                this.message = {phase:"wireless", text:radio.name + (state.state === 3 ? " 正在切换信道" : " 正在恢复无线服务"), detail:"等待驱动确认广播已启用；不以固定倒计时判定就绪。", percent:null};
                return;
            }
        }
        if (unknown.length && !reboot)
            return this.end("unverified", "配置应用流程已结束", unknown.join("、") + " 驱动暂不提供广播状态，无法确认终端是否已能连接。请返回页面核对。", false);
        this.end("complete", reboot ? "已确认设备重新启动，管理服务可访问" : "已确认后台配置应用流程结束", unknown.length ? "部分无线驱动不提供广播状态；此结果不代表终端或互联网已连通。" : "无线状态已读取；终端重新关联和互联网连通性需要单独检查。", true);
    };
    Controller.prototype.unavailable = function(detail){
        var o = this.options;
        this.message = {phase:"reconnecting", text:"连接暂时中断，正在重新检测", detail:detail || (o.mode === "3" ? "AP 地址可能由上级路由器重新分配。请在上级设备列表查找；不会跳到猜测的地址。" : "设备可能正在重启，终端也可能正在重新获取地址。"), percent:null};
    };
    Controller.prototype.tick = function(){
        if (!this.active) return;
        var self = this, o = this.options, token = this.generation;
        var timeout = o.timeout || 900;
        if (this.elapsed() >= timeout)
            return this.end("timeout", "等待超时，尚未确认完成", o.mode === "3" ? "请到上级路由器的设备列表查找 AP 的新地址。不要重复提交切换。" : "请检查终端地址和设备状态；可使用下方入口重新访问。超时不等于设备操作失败。", false);
        if (o.kind === "legacy") {
            this.message = {phase:"waiting", text:"正在等待操作结果", detail:"已等待 " + this.elapsed() + " 秒；当前接口没有提供可核实的完成率。", percent:null};
        } else if (!this.meta && o.kind === "apply" && this.elapsed() >= 30) {
            this.message = {phase:"no_ack", text:"尚未收到保存响应", detail:"连接可能已经中断，结果尚未确认。请勿重复提交。", percent:null};
        }
        if (o.kind !== "legacy" && (this.meta || o.kind !== "apply") && !this.request && this.env.now() - this.lastPoll >= 2000) {
            this.lastPoll = this.env.now();
            this.request = this.env.request(function(error, data){
                if (!self.active || token !== self.generation) return;
                self.request = null;
                if (error) self.unavailable(error === "auth" ? "后台需要重新登录，请通过管理入口登录后继续检查。" : "");
                else self.accept(data);
                if (self.active) self.draw();
            });
        }
        if (!this.active) return;
        this.draw();
        this.timer = this.env.setTimeout(function(){
            if (token === self.generation) self.tick();
        }, 1000);
    };
    root.UiOperationController = Controller;
})(window);

var uiWaitController = null;
var uiWaitOverflow = null;
var uiWaitContainer = null;

function uiWaitStyle(){
    if (document.getElementById("uiWaitStyle")) return;
    var style = document.createElement("style");
    style.id = "uiWaitStyle";
    style.textContent = "@keyframes uiWaitSlide{0%{transform:translateX(-110%)}100%{transform:translateX(390%)}}.ui-wait-card{box-sizing:border-box;max-width:650px;margin:12vh auto;padding:26px;background:#fff;color:#253c59;border-radius:8px;text-align:left;box-shadow:0 4px 30px #0006}.ui-wait-track{height:18px;background:#ddd;overflow:hidden;border-radius:5px;margin:18px 0}.ui-wait-bar{height:100%;background:#169cdb;transition:width .25s}.ui-wait-busy{width:25%!important;animation:uiWaitSlide 1.4s linear infinite}.ui-wait-detail{line-height:1.7;margin:12px 0}.ui-wait-meta{color:#75859a;font-size:13px}.ui-wait-card h3{margin:0;font-size:20px}.ui-wait-card a{color:#2169dc;margin-right:18px}.ui-wait-card button{margin-top:15px}.ui-wait-card:focus{outline:2px solid #74ccff}";
    document.head.appendChild(style);
}
function uiWaitOpen(preferBar){
    uiWaitStyle();
    var node = document.getElementById(preferBar ? "LoadingBar" : "Loading") || document.getElementById("Loading") || document.getElementById("LoadingBar");
    if (!node) {
        node = document.createElement("div"); node.id = "Loading"; document.body.appendChild(node);
    }
    uiWaitContainer = node;
    node.innerHTML = '<div class="ui-wait-card" role="dialog" aria-modal="true" aria-labelledby="uiWaitTitle" tabindex="-1"><h3 id="uiWaitTitle"></h3><div class="ui-wait-track" role="progressbar" id="uiWaitTrack" aria-label="操作进度"><div class="ui-wait-bar ui-wait-busy" id="uiWaitBar"></div></div><div id="uiWaitDetail" class="ui-wait-detail" role="status" aria-live="polite"></div><div id="uiWaitMeta" class="ui-wait-meta"></div><div style="margin-top:15px"><a id="uiWaitLink" style="display:none">打开管理页面</a><button type="button" id="uiWaitClose" class="btn" style="display:none">关闭提示并核对页面</button></div></div>';
    node.style.cssText = "position:fixed;inset:0;z-index:20000;overflow:auto;visibility:visible;display:block;background:rgba(19,36,61,.4);padding:0 16px;";
    if (uiWaitOverflow === null) uiWaitOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.getElementById("uiWaitClose").onclick = function(){hideLoading();};
    if (typeof disableCheckChangedStatus === "function") disableCheckChangedStatus();
    node.firstChild.focus();
}
function uiWaitRender(view){
    var title = document.getElementById("uiWaitTitle");
    if (!title) return;
    title.textContent = view.text;
    document.getElementById("uiWaitDetail").textContent = view.detail || "";
    var track = document.getElementById("uiWaitTrack"), bar = document.getElementById("uiWaitBar");
    var actual = typeof view.percent === "number" && isFinite(view.percent);
    bar.className = "ui-wait-bar" + (!actual && !view.terminal ? " ui-wait-busy" : "");
    bar.style.width = actual ? view.percent + "%" : "0%";
    if (actual) {
        track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100"); track.setAttribute("aria-valuenow", String(view.percent));
    } else {
        track.removeAttribute("aria-valuemin"); track.removeAttribute("aria-valuemax"); track.removeAttribute("aria-valuenow");
    }
    document.getElementById("uiWaitMeta").textContent = "已等待 " + view.elapsed + " 秒" + (actual && view.phase === "cac" ? " · 本轮 DFS 检测 " + view.percent + "%" : "");
    var link = document.getElementById("uiWaitLink");
    link.style.display = view.link && (view.terminal || view.elapsed >= 20) ? "inline" : "none";
    if (view.link) link.href = view.link;
    document.getElementById("uiWaitClose").style.display = view.terminal ? "inline-block" : "none";
}
function uiWaitRequest(callback){
    var xhr = new XMLHttpRequest(), ended = false;
    function finish(error, value){
        if (ended) return; ended = true; callback(error, value);
    }
    xhr.open("GET", "/operation_status.json?_=" + Date.now(), true);
    xhr.timeout = 4000;
    xhr.onload = function(){
        if (xhr.status === 401 || xhr.status === 403) return finish("auth");
        if (xhr.status !== 200) return finish("network");
        try { finish(null, JSON.parse(xhr.responseText)); } catch (error) { finish("invalid"); }
    };
    xhr.onerror = xhr.ontimeout = function(){finish("network");};
    xhr.send(null);
    return {abort:function(){ended = true; xhr.abort();}};
}
function uiWaitStart(options, preferBar){
    if (uiWaitController) uiWaitController.stop();
    uiWaitOpen(preferBar);
    uiWaitController = new UiOperationController({
        now:function(){return window.performance && performance.now ? performance.now() : Date.now();},
        setTimeout:function(fn, ms){return setTimeout(fn, ms);},
        clearTimeout:function(id){clearTimeout(id);},
        request:uiWaitRequest, render:uiWaitRender
    });
    uiWaitController.start(options);
    return uiWaitController;
}
function uiSafeManagementLink(address){
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return "";
    var parts = address.split(".");
    for (var i=0; i<4; ++i) if (+parts[i] > 255) return "";
    return location.protocol + "//" + address + (location.port ? ":" + location.port : "") + "/";
}
function uiApplyCommitted(meta, done){
    if (!meta || meta.version !== 1) return false;
    if (!uiWaitController || !uiWaitController.active) uiWaitStart({kind:"apply", boot:uiBootBefore});
    uiWaitController.options.done = done;
    uiWaitController.ack(meta);
    return true;
}
function uiRebootWait(options){
    options = options || {};
    options.kind = options.kind || "reboot";
    options.boot = options.boot || uiBootBefore;
    options.title = options.title || "正在提交重启请求";
    if (typeof options.link === "undefined") options.link = location.protocol + "//" + location.host + "/";
    return uiWaitStart(options, options.preferBar);
}
function showLoading(seconds, flag){
    uiWaitStart({kind:typeof seconds === "number" ? "legacy" : "apply", title:"正在提交操作", boot:uiBootBefore});
}
function LoadingTime(seconds, flag){showLoading(seconds, flag);}
function showLoadingBar(seconds){uiRebootWait({preferBar:true, title:"等待设备恢复", done:function(){location.href="/";}});}
function LoadingProgress(seconds){showLoadingBar(seconds);}
function showLoadingOne(){showLoading();}
function showResetBar(){uiRebootWait({preferBar:true, title:"配置已上传，等待自动重启", done:function(){location.href="/";}});}
function showUpgradeBar(){uiRebootWait({preferBar:true, kind:"flash", title:"固件已接收，等待写入和自动重启", timeout:900, done:function(){location.href="/";}});}
function stopLoadingBar(){
    if (uiWaitController) uiWaitController.end("failed", "操作未完成", "请查看页面错误信息，不要断电或重复提交。", false);
}
function hideLoadingBar(){hideLoading();}
function hideLoading(flag){
    if (uiWaitController) uiWaitController.stop();
    if (uiWaitContainer) {uiWaitContainer.style.visibility="hidden"; uiWaitContainer.style.display="none";}
    if (uiWaitOverflow !== null) {document.documentElement.style.overflow=uiWaitOverflow; uiWaitOverflow=null;}
    if (typeof enableCheckChangedStatus === "function") enableCheckChangedStatus();
}
if (window.addEventListener) window.addEventListener("pagehide", function(){if (uiWaitController) uiWaitController.stop();});
