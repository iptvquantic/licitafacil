// src/services/email.service.js — e-mail transacional por API HTTP (Resend ou Brevo). Sem chave: só registra no log.
'use strict';

function configurado() { return !!(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY); }

async function enviarEmail(para, assunto, html, texto) {
  const remetente = process.env.EMAIL_FROM || 'LicitaFácil <onboarding@resend.dev>';
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html: html, text: texto }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error('Resend respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return true;
  }
  if (process.env.BREVO_API_KEY) {
    const m = remetente.match(/^(.*)<([^>]+)>$/);
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: m ? { name: m[1].trim(), email: m[2].trim() } : { email: remetente },
        to: [{ email: para }], subject: assunto, htmlContent: html, textContent: texto
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error('Brevo respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return true;
  }
  return false;
}

module.exports = { enviarEmail, configurado };
