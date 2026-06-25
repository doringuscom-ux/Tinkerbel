document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('errorMsg');
  const loginBtn = document.getElementById('loginBtn');

  // Check if already logged in (optional UX improvement, but safe since backend verifies)
  const existingToken = localStorage.getItem('api_password');
  if (existingToken) {
    verifyToken(existingToken).then(isValid => {
      if (isValid) {
        window.location.href = '/';
      }
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    
    if (!password) return;

    loginBtn.innerText = 'Logging in...';
    loginBtn.disabled = true;
    errorMsg.style.display = 'none';

    const isValid = await verifyToken(password);
    
    if (isValid) {
      localStorage.setItem('api_password', password);
      window.location.href = '/';
    } else {
      errorMsg.style.display = 'block';
      loginBtn.innerText = 'Log In';
      loginBtn.disabled = false;
    }
  });

  async function verifyToken(password) {
    try {
      const res = await fetch('/api/sessions', {
        headers: {
          'x-api-password': password
        }
      });
      return res.ok;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
});
