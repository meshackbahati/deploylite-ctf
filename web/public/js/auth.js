document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            hideAlert('loginAlert');

            try {
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                await apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });

                window.location.href = '/dashboard';
            } catch (error) {
                showAlert('loginAlert', error.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('registerBtn');
            btn.disabled = true;
            btn.textContent = 'Creating account...';
            hideAlert('registerAlert');

            try {
                const email = document.getElementById('email').value;
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const company = document.getElementById('company')?.value;

                await apiRequest('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ email, username, password, company })
                });

                window.location.href = '/dashboard';
            } catch (error) {
                showAlert('registerAlert', error.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }
});
