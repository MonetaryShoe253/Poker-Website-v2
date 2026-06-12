import { Text } from "@react-email/components";
import { EmailShell, EmberButton, bodyText, headingText, mutedText } from "./EmailShell";

export function PasswordResetEmail({ name, url }: { name: string; url: string }) {
  return (
    <EmailShell preview="Reset your UOS Poker password.">
      <Text style={headingText}>Lost the key to your seat?</Text>
      <Text style={bodyText}>
        {name ? `${name}, someone` : "Someone"} (hopefully you) asked to reset your UOS Poker
        password. One click below sets a new one.
      </Text>
      <EmberButton href={url}>RESET PASSWORD</EmberButton>
      <Text style={mutedText}>
        The link expires in an hour. If this wasn't you, you can ignore it — your password
        stays as it was.
      </Text>
    </EmailShell>
  );
}
