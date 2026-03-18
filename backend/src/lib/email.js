import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendMeetingEmail = async ({ emails, meetingDetails, host }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("SMTP credentials not configured. Skipping meeting email.");
    return;
  }

  if (!emails || emails.length === 0) {
    console.log("No emails provided for meeting notification.");
    return;
  }

  try {
    const transporter = getTransporter();
    
    const meetingTime = new Date(meetingDetails.startTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">You're Invited to a Meeting!</h2>
        </div>
        <div style="padding: 24px;">
          <h3 style="margin-top: 0; color: #1e293b; font-size: 20px;">${meetingDetails.title}</h3>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #475569;"><strong>Host:</strong> ${host.fullName}</p>
            <p style="margin: 0 0 10px 0; color: #475569;"><strong>When:</strong> ${meetingTime}</p>
            <p style="margin: 0 0 10px 0; color: #475569;"><strong>Channel:</strong> ${meetingDetails.channel}</p>
            <p style="margin: 0; color: #475569;"><strong>Duration:</strong> ${meetingDetails.duration} minutes</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${meetingDetails.meetingLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Join Meeting Now
            </a>
          </div>
          
          <p style="margin-top: 30px; font-size: 14px; color: #64748b; text-align: center;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${meetingDetails.meetingLink}" style="color: #3b82f6;">${meetingDetails.meetingLink}</a>
          </p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Collab Meetings" <${process.env.SMTP_USER}>`,
      to: emails.join(", "),
      subject: `Meeting Starting Now: ${meetingDetails.title}`,
      html: htmlContent,
    });

    console.log("Meeting emails sent successfully:", info.messageId);
  } catch (error) {
    console.error("Error sending meeting email:", error);
  }
};
