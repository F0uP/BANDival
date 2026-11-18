import { expect, test } from "@playwright/test";
import { ApiClient, PASSWORD, registerUser, uniqueEmail } from "./helpers";

test.describe("band, members & invites", () => {
  test("invite link lets a new user join directly during registration", async ({ baseURL }) => {
    const owner = await registerUser(baseURL!, { name: "Owner", bandName: "Invite Band" });
    const email = uniqueEmail("invitee");

    const created = await owner.api.json<{ inviteToken: string; inviteLink: string }>(
      owner.api.post(`/api/bands/${owner.bandId}/invites`, { email }), 201,
    );
    expect(created.inviteLink).toContain("inviteToken=");

    const preview = await owner.api.json<{ valid: boolean; bandName: string }>(
      (await ApiClient.create(baseURL!)).get(`/api/band-invites/preview?token=${encodeURIComponent(created.inviteToken)}`),
    );
    expect(preview).toMatchObject({ valid: true, bandName: "Invite Band" });

    const invitee = await registerUser(baseURL!, { email, name: "Invitee", inviteToken: created.inviteToken });
    expect(invitee.bands).toHaveLength(1);
    expect(invitee.bands[0].id).toBe(owner.bandId);
    expect(invitee.bands[0].role).toBe("member");

    const members = await owner.api.json<{ members: Array<{ userId: string }> }>(owner.api.get(`/api/bands/${owner.bandId}/members`));
    expect(members.members.map((member) => member.userId)).toContain(invitee.userId);

    // Members may not manage invites.
    await invitee.api.json(invitee.api.post(`/api/bands/${owner.bandId}/invites`, { email: uniqueEmail("x") }), 403);
  });

  test("existing user accepts invite and last owner is protected", async ({ baseURL }) => {
    const owner = await registerUser(baseURL!);
    const other = await registerUser(baseURL!);
    const invite = await owner.api.json<{ inviteToken: string }>(owner.api.post(`/api/bands/${owner.bandId}/invites`, { email: other.email }), 201);

    const accepted = await other.api.json<{ bandId: string }>(other.api.post("/api/band-invites/accept", { token: invite.inviteToken }));
    expect(accepted.bandId).toBe(owner.bandId);

    const { members } = await owner.api.json<{ members: Array<{ id: string; userId: string }> }>(owner.api.get(`/api/bands/${owner.bandId}/members`));
    const self = members.find((member) => member.userId === owner.userId)!;

    // Last owner cannot be demoted and cannot leave.
    await owner.api.json(owner.api.patch(`/api/bands/${owner.bandId}/members/${self.id}`, { role: "member" }), 409);
    await owner.api.json(owner.api.post("/api/account/leave-band", { bandId: owner.bandId }), 409);

    // Members can update their own instrument.
    const otherMember = members.find((member) => member.userId === other.userId)!;
    await other.api.json(other.api.patch(`/api/bands/${owner.bandId}/members/${otherMember.id}`, { instrumentPrimary: "Bass" }));
  });

  test("profile and password change", async ({ baseURL }) => {
    const user = await registerUser(baseURL!);
    await user.api.json(user.api.patch(`/api/bands/${user.bandId}/members/me`, { displayName: "Renamed", instrumentPrimary: "Drums" }));
    await user.api.json(user.api.patch("/api/account/password", { currentPassword: PASSWORD, newPassword: "a-brand-new-password" }));

    const fresh = await ApiClient.create(baseURL!);
    await fresh.json(fresh.post("/api/auth/login", { email: user.email, password: "a-brand-new-password" }));
    const me = await fresh.json<{ user: { displayName: string } }>(fresh.get("/api/auth/me"));
    expect(me.user.displayName).toBe("Renamed");
  });

  test("users cannot access other bands", async ({ baseURL }) => {
    const a = await registerUser(baseURL!);
    const b = await registerUser(baseURL!);
    await b.api.json(b.api.get(`/api/songs?bandId=${a.bandId}`), 403);
    await b.api.json(b.api.get(`/api/bands/${a.bandId}/members`), 403);
  });
});
