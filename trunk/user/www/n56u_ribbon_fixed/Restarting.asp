<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/ui/base.css?v=1">
<link rel="stylesheet" href="/ui/icons.css?v=1">
<title></title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">

<link rel="shortcut icon" href="images/favicon.ico">
<link rel="icon" href="images/favicon.png">

<script>
var action_mode = '<% get_parameter("action_mode"); %>';
var boot_time = parent.board_boot_time();

function redirect(){
    var target = action_mode === " RestoreNVRAM " ? "http://192.168.2.1/" : "/";
    parent.uiRebootWait({link:target, done:function(){parent.location.href=target;}});
}
</script>
</head>
<body onLoad="redirect();">

</body>
</html>
