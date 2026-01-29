document.getElementById("button-toggle").addEventListener("change", () => {
    //document.getElementById("attendance").classList.toggle("toggled")
    document.getElementById("questions").classList.toggle("toggled");
    document.getElementById("main").classList.toggle("toggled");

})
function toggle() {
    var el = window.event.target;
    if (el.value == "Click Here") {
        //document.getElementsByClassName("questions")[0].classList.toggle("toggled");  
        document.getElementsByClassName("main")[0].classList.toggle("toggled");  
        document.getElementsByClassName("questions")[0].classList.toggle("yes");
        el.value = "Yes";    
    }
    else if (el.value == "No") {
        el.value = "Yes";
        document.getElementsByClassName("questions")[0].classList.toggle("yes");
        document.getElementsByClassName("questions")[0].classList.toggle("no");
    }
    else {
        el.value = "No";
        document.getElementsByClassName("questions")[0].classList.toggle("yes");
        document.getElementsByClassName("questions")[0].classList.toggle("no");
    }
}



