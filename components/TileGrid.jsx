import LaunchpadTile from "./tiles/LaunchpadTile";
import PlaceholderTile from "./tiles/PlaceholderTile";

export default function TileGrid({ context }) {
  return (
    <div className="grid">
      {context.mail && (
        <PlaceholderTile
          name="Mail"
          milestone="M2"
          detail={`Unread count and recent messages from ${context.mail.mailbox} via Microsoft Graph.`}
        />
      )}
      <PlaceholderTile
        name="Calendar"
        milestone="M2"
        detail="Today plus the next three days, via Microsoft Graph."
      />
      <PlaceholderTile
        name="Teams"
        milestone="M3"
        detail="Recent chats and channel messages with unread badges."
      />
      {context.github && (
        <PlaceholderTile
          name="Boards"
          milestone="M4"
          detail={`Open issues by status from the ${context.name} GitHub Projects (${context.github.account} account).`}
        />
      )}
      <PlaceholderTile
        name="Files"
        milestone="M5"
        detail="Recent files from this context's SharePoint site or OneDrive."
      />
      <LaunchpadTile context={context} />
    </div>
  );
}
