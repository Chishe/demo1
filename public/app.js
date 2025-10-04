async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (data.success) {
    Swal.fire({
      icon: "success",
      title: "เข้าสู่ระบบสำเร็จ",
      text: `ยินดีต้อนรับ ${data.firstname} ${data.lastname} (${data.position})`,
      confirmButtonText: "ไปยัง Dashboard",
    }).then(() => {
      localStorage.setItem(
        "userData",
        JSON.stringify({
          firstname: data.firstname,
          lastname: data.lastname,
          position: data.position,
        })
      );
      window.location.href = "/dashboard.html";
    });
  } else {
    // แสดง SweetAlert2 error popup
    Swal.fire({
      icon: "error",
      title: "เข้าสู่ระบบไม่สำเร็จ",
      text: data.message,
    });
  }
}

togglePassword.addEventListener("click", () => {
  const type =
    password.getAttribute("type") === "password" ? "text" : "password";
  password.setAttribute("type", type);

  // เปลี่ยน icon ด้วย innerHTML
  togglePassword.innerHTML =
    type === "password"
      ? '<img src="../picture/view.png" alt="view" class="btn-img" />'
      : '<img src="../picture/hide.png" alt="hide" class="btn-img" />';
});


