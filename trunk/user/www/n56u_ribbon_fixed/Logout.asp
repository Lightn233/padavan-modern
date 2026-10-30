<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/ui/base.css?v=1">
<link rel="stylesheet" href="/ui/icons.css?v=1">
<title><#Web_Title#></title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">

<link rel="shortcut icon" href="images/favicon.ico">
<link rel="icon" href="images/favicon.png">


<script>
function initial(){
	var xmlhttp;
	try{
		if (window.XMLHttpRequest)
			xmlhttp=new XMLHttpRequest();
		else
			xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
	}catch (e){
		xmlhttp=null;
	}
	if (xmlhttp != null){
		xmlhttp.open("HEAD","logout",true,"logout","");
		xmlhttp.send(null);
	}
}
</script>
</head>
<body onload="initial()">
    <div style="margin-top: 50px;">
        <center>
            <div class="well" style="max-width: 600px;">
                <h2><#logoutmessage#></h2>

                <div><#Not_authpage_login_again#></div>
            </div>
        </center>
    </div>
</body>
</html>
