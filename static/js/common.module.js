//alert("Javacript подключен");

//https://www.cat-in-web.ru/tryuk-s-edinitsami-vyuporta-na-mobilnyh-ustrojstvah/
export function set_screen_vh()
{
    // First we get the viewport height and we multiple it by 1% to get a value for a vh unit
    let vh = window.innerHeight * 0.01;
    // Then we set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

export function add_placeholder(el, ph) 
{
	if(typeof el === 'string') {
	   el = document.getElementById(el);
	} 
	else if(el instanceof HTMLElement === false) {
		console.log('Not a valid HTML element.');
		return false;
	}

	el.setAttribute('placeholder', ph);
	return true;
}

export function is_integer(num) 
{
    return (num ^ 0) === num;
}

// https://ru.stackoverflow.com/questions/625113/input-%D0%BF%D0%BE%D0%BB%D0%B5-%D1%82%D0%BE%D0%BB%D1%8C%D0%BA%D0%BE-%D0%B4%D0%BB%D1%8F-%D1%86%D0%B8%D1%84%D1%80-html
export function validate_int(evt) 
{
    var theEvent = evt || window.event;
    var key = theEvent.keyCode || theEvent.which;
    key = String.fromCharCode( key );
    var regex = /[-.0-9]|\./;

    if( !regex.test(key) ) {
        theEvent.returnValue = false;
        if(theEvent.preventDefault) theEvent.preventDefault();
    }
}

function check_value(id, val)
{
    if (document.getElementById(id).value > val) {document.getElementById(id).value = val;}
}

function recover_btn(btn_id, type, timer, style_prefix, recover_text)
{
    clearTimeout(timer);
    btn_id.innerText = recover_text;
    btn_id.classList.toggle("ctrl-btn-color");
    btn_id.classList.toggle("ctrl-button");

    btn_id.classList.toggle("cell-btn-" + style_prefix);
    if (type == "ok") btn_id.classList.toggle("cell-btn-" + style_prefix + "-ok");
    else btn_id.classList.toggle("cell-btn-" + style_prefix + "-error");
}

function show_ok(btn_id, timer, style_prefix, recover_text)
{
    //console.log("Showing OK\n");
    btn_id.innerText = "OK";
    btn_id.classList.toggle("ctrl-btn-color");
    btn_id.classList.toggle("ctrl-button");

    btn_id.classList.toggle("cell-btn-" + style_prefix);
    btn_id.classList.toggle("cell-btn-" + style_prefix + "-ok");
    timer = setTimeout(recover_btn, 1000, btn_id, "ok", timer, style_prefix, recover_text);
}

function show_error(btn_id, timer, style_prefix, code, recover_text)
{
    btn_id.innerText = "Error: " + code;
    btn_id.classList.toggle("ctrl-btn-color");
    btn_id.classList.toggle("ctrl-button");

    btn_id.classList.toggle("cell-btn-" + style_prefix);
    btn_id.classList.toggle("cell-btn-" + style_prefix + "-error");
    timer = setTimeout(recover_btn, 1000, btn_id, "err", timer, style_prefix, recover_text);
}