export const features = {
  uiEditAnyMessage: process.env.NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE === 'true',
  uiAttachments: process.env.NEXT_PUBLIC_RT_UI_ATTACHMENTS === 'true'
} as const;
