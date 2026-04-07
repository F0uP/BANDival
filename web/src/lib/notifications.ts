import { prisma } from "@/lib/prisma";

type NotificationKind = "invite" | "event" | "setlist" | "song";

function preferenceFlag(kind: NotificationKind): "notifyInvites" | "notifyEvents" | "notifySetlists" | "notifySongs" {
  switch (kind) {
    case "invite":
      return "notifyInvites";
    case "event":
      return "notifyEvents";
    case "setlist":
      return "notifySetlists";
    case "song":
    default:
      return "notifySongs";
  }
}

async function sendEmailNotifications(args: {
  recipients: string[];
  title: string;
  body: string;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from || args.recipients.length === 0) {
    return;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });

    await transporter.sendMail({
      from,
      to: args.recipients.join(","),
      subject: args.title,
      text: args.body,
      html: `<p>${args.body}</p>`,
    });
  } catch {
    // Notification email failures should never block core actions.
  }
}

export async function notifyBandMembers(args: {
  bandId: string;
  actorUserId?: string;
  kind: NotificationKind;
  type: string;
  title: string;
  body: string;
  payload?: unknown;
}): Promise<void> {
  const members = await prisma.bandMember.findMany({
    where: { bandId: args.bandId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  const recipients = members.filter((member) => member.userId !== args.actorUserId);
  if (recipients.length === 0) {
    return;
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: {
      bandId: args.bandId,
      userId: {
        in: recipients.map((r) => r.userId),
      },
    },
  });

  const byUser = new Map(preferences.map((p) => [p.userId, p]));
  const requiredFlag = preferenceFlag(args.kind);

  const inAppRecipients = recipients.filter((member) => {
    const pref = byUser.get(member.userId);
    if (!pref) {
      return true;
    }

    return pref.inAppEnabled && pref[requiredFlag];
  });

  if (inAppRecipients.length > 0) {
    await prisma.notification.createMany({
      data: inAppRecipients.map((member) => ({
        userId: member.userId,
        bandId: args.bandId,
        type: args.type,
        title: args.title,
        body: args.body,
        payload: (args.payload ?? null) as never,
      })),
    });
  }

  const emailRecipients = recipients
    .filter((member) => {
      const pref = byUser.get(member.userId);
      return pref?.emailEnabled && pref[requiredFlag];
    })
    .map((member) => member.user.email);

  await sendEmailNotifications({
    recipients: emailRecipients,
    title: args.title,
    body: args.body,
  });
}
