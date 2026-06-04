import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
// Use the provided credentials as defaults if env vars are not set, per user request context
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465, false for other ports
  pool: true, // Enable connection pooling
  maxConnections: 5,
  maxMessages: 100,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendPermissionRequestEmail(
  toEmail: string | string[],
  permisoId: number,
  solicitanteName: string,
  tipoPermiso: string,
  motivo: string
) {
  const recipients = Array.isArray(toEmail) ? toEmail.join(', ') : toEmail;

  // Create tokens for actions
  const approveToken = jwt.sign(
    { permisoId, action: 'APROBADO' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const rejectToken = jwt.sign(
    { permisoId, action: 'RECHAZADO' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const approveUrl = `${APP_URL}/api/permisos/responder?token=${approveToken}`;
  const rejectUrl = `${APP_URL}/api/permisos/responder?token=${rejectToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #2563eb; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0;">Solicitud de Permiso</h2>
      </div>
      
      <div style="padding: 20px;">
        <p style="font-size: 16px; color: #374151;">El usuario <strong>${solicitanteName}</strong> ha solicitado un permiso.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <p style="margin: 5px 0;"><strong>Tipo:</strong> ${tipoPermiso}</p>
          <p style="margin: 5px 0;"><strong>Motivo:</strong> ${motivo || 'No especificado'}</p>
        </div>

        <p style="margin-bottom: 20px; color: #6b7280;">Seleccione una acción para responder a esta solicitud:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${approveUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 15px; display: inline-block;">Aceptar</a>
          <a href="${rejectUrl}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Rechazar</a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          Si los botones no funcionan, copie y pegue los siguientes enlaces:<br><br>
          <strong>Aceptar:</strong><br> ${approveUrl}<br><br>
          <strong>Rechazar:</strong><br> ${rejectUrl}
        </p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Servilution CRM" <${SMTP_USER}>`,
      to: recipients,
      subject: `[Solicitud de Permiso] ${tipoPermiso} - ${solicitanteName}`,
      html,
    });
    console.log(`Email sent to ${recipients}: ${info.messageId}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
}
