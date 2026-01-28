document.getElementById("button-toggle").addEventListener("change", () => {
    //document.getElementById("attendance").classList.toggle("toggled")
    document.getElementById("questions").classList.toggle("toggled");
    document.getElementById("main").classList.toggle("toggled");

})
function toggle() {
    var el = window.event.target;
    if (el.value == "No") {
        el.value = "Yes";
    }
    else {
        el.value = "No";
    }
    document.getElementsByClassName("questions")[0].classList.toggle("toggled");
    document.getElementsByClassName("main")[0].classList.toggle("toggled");
}



