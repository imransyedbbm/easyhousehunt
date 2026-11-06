/** WhatsApp message inviting a home owner to list for free. */
export const inviteOwnerUrl = () =>
  `https://wa.me/?text=${encodeURIComponent(
    "Have a home or office to let in Bengaluru? List it free on EasyHouseHunt and talk to tenants directly. No brokers, no brokerage.\nhttps://easyhousehunt.com/?list=1",
  )}`;

/** Public shortlist page for up to 10 listings (by share code), e.g. to send to family. */
export const shortlistUrl = (codes: string[]) => `https://easyhousehunt.com/s/${codes.slice(0, 10).join("-")}`;
