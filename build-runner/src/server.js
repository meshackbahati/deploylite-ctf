const express = require('express');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');

const app = express();
const PORT = 5000;

app.use(morgan('combined'));
app.use(express.json({ limit: '5mb' }));

const BLACKLIST = [
    'cat', 'flag', 'rm', 'wget', 'curl', 'nc',
    'ncat', 'python', 'perl', 'ruby', 'php',
    'telnet', 'ssh', 'scp', 'ftp', '/etc/passwd',
    '/etc/shadow', 'mkfifo', 'mknod'
];

const BLOCKED_CHARS = [';', '&', '|', '`', '$('];

function sanitizeInput(input) {
    let sanitized = input;

    for (const blocked of BLOCKED_CHARS) {
        if (sanitized.includes(blocked)) {
            sanitized = sanitized.replace(new RegExp(
                blocked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'
            ), '');
        }
    }

    for (const word of BLACKLIST) {
        const regex = new RegExp(word, 'gi');
        if (regex.test(sanitized)) {
            sanitized = sanitized.replace(regex, '***');
        }
    }

    return sanitized;
}

function sanitizeStrict(input) {
    let sanitized = input;

    for (const blocked of BLOCKED_CHARS) {
        sanitized = sanitized.split(blocked).join('');
    }

    for (const word of BLACKLIST) {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        sanitized = sanitized.replace(regex, '***');
    }

    if (sanitized.length > 512) {
        sanitized = sanitized.substring(0, 512);
    }

    return sanitized;
}

app.post('/internal/run', (req, res) => {
    const { build_id, repo_url, build_script, branch } = req.body;
    const startTime = Date.now();
    const workDir = `/tmp/build-${uuidv4()}`;

    const debugMode = req.query.debug === 'true';

    let output = '';

    try {
        output += `[${new Date().toISOString()}] Build ${build_id || 'unknown'} started\n`;
        output += `[${new Date().toISOString()}] Target branch: ${branch || 'main'}\n`;
        output += `[${new Date().toISOString()}] Creating workspace...\n`;

        execSync(`mkdir -p ${workDir}`, { timeout: 5000 });

        if (repo_url) {
            output += `[${new Date().toISOString()}] Cloning repository...\n`;

            const sanitizedUrl = debugMode ? repo_url : sanitizeStrict(repo_url);

            try {
                const cloneResult = execSync(
                    `cd ${workDir} && git clone --depth 1 --branch ${branch || 'main'} "${sanitizedUrl}" . 2>&1`,
                    { timeout: 15000, encoding: 'utf-8' }
                );
                output += cloneResult + '\n';
            } catch (cloneErr) {
                output += `[${new Date().toISOString()}] Repository clone failed: ${cloneErr.message}\n`;
                output += `[${new Date().toISOString()}] Proceeding with build script...\n`;
            }
        }

        if (build_script) {
            output += `[${new Date().toISOString()}] Executing build script...\n`;

            const sanitizedScript = debugMode ? build_script : sanitizeInput(build_script);

            if (debugMode) {
                output += `[DEBUG] Raw script: ${build_script}\n`;
                output += `[DEBUG] Sanitized: ${sanitizedScript}\n`;
            }

            try {
                const buildResult = execSync(
                    `cd ${workDir} && bash -c "${sanitizedScript}"`,
                    { timeout: 20000, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
                );
                output += buildResult;
                output += `\n[${new Date().toISOString()}] Build script completed successfully\n`;
            } catch (buildErr) {
                output += buildErr.stdout || '';
                output += buildErr.stderr || '';
                output += `\n[${new Date().toISOString()}] Build script exited with error\n`;
            }
        }

        try {
            execSync(`rm -rf ${workDir}`, { timeout: 5000 });
        } catch (e) { }

        const duration = Date.now() - startTime;
        output += `[${new Date().toISOString()}] Build finished in ${duration}ms\n`;

        res.json({
            success: true,
            output: output,
            duration_ms: duration,
            build_id: build_id
        });

    } catch (error) {
        try {
            execSync(`rm -rf ${workDir}`, { timeout: 5000 });
        } catch (e) { }

        const duration = Date.now() - startTime;

        res.json({
            success: false,
            output: output + `\n[ERROR] ${error.message}\n`,
            duration_ms: duration,
            build_id: build_id
        });
    }
});

app.get('/internal/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'build-runner',
        version: '1.2.0',
        uptime: process.uptime()
    });
});

app.get('/internal/version', (req, res) => {
    res.json({
        service: 'deploylite-build-runner',
        version: '1.2.0',
        node: process.version,
        platform: process.platform,
        arch: process.arch
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Build runner listening on port ${PORT}`);
});
