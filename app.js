let password=sessionStorage.getItem("moviePass")||"";
const $=s=>document.querySelector(s);
const login=$("#login"), app=$("#app"), grid=$("#grid");

function headers(){return {"x-site-password":password}}
function showApp(){login.classList.add("hidden");app.classList.remove("hidden");$("#logout").classList.remove("hidden");load();}
function showLogin(){app.classList.add("hidden");login.classList.remove("hidden");$("#logout").classList.add("hidden");}

async function load(){
 const r=await fetch("/api/videos",{headers:headers()});
 if(r.status===401)return logout();
 const videos=await r.json();
 grid.innerHTML=videos.length?"":"<div class='card'>No videos yet. Upload your first video.</div>";
 videos.forEach(v=>{
   const el=document.createElement("article"); el.className="movie";
   el.innerHTML=`<div class="thumb">▶️</div><h3></h3><small>${(v.size/1024/1024).toFixed(1)} MB</small><div class="actions"><button class="watch">Watch</button><button class="danger del">Delete</button></div>`;
   el.querySelector("h3").textContent=v.title;
   el.querySelector(".watch").onclick=()=>watch(v);
   el.querySelector(".del").onclick=()=>remove(v.id);
   grid.appendChild(el);
 });
}
function watch(v){
 $("#playerTitle").textContent=v.title;
 const p=$("#player"); p.src=v.url; p.setAttribute("data-id",v.id);
 $("#playerModal").classList.remove("hidden");
}
$("#close").onclick=()=>{const p=$("#player");p.pause();p.removeAttribute("src");p.load();$("#playerModal").classList.add("hidden")};

async function remove(id){
 if(!confirm("Delete this video?"))return;
 await fetch("/api/videos/"+encodeURIComponent(id),{method:"DELETE",headers:headers()}); load();
}
$("#loginBtn").onclick=async()=>{
 const p=$("#password").value;
 const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});
 const d=await r.json();
 if(d.ok){password=p;sessionStorage.setItem("moviePass",p);$("#loginMsg").textContent="";showApp();}
 else $("#loginMsg").textContent="Wrong password";
};
$("#password").addEventListener("keydown",e=>{if(e.key==="Enter")$("#loginBtn").click()});
$("#logout").onclick=logout;
function logout(){password="";sessionStorage.removeItem("moviePass");showLogin()}
$("#uploadForm").onsubmit=async e=>{
 e.preventDefault();
 const form=new FormData(e.target); $("#progress").textContent="Uploading...";
 const r=await fetch("/api/upload",{method:"POST",headers:headers(),body:form});
 $("#progress").textContent=r.ok?"Uploaded successfully.":"Upload failed.";
 if(r.ok){e.target.reset();load();}
};
if(password) showApp(); else showLogin();
const searchInput = document.getElementById("searchInput");

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();

    document.querySelectorAll("#grid > *").forEach(card => {
      card.style.display =
        card.innerText.toLowerCase().includes(query) ? "" : "none";
    });
  });
}
