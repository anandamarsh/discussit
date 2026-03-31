export type CommentItem = {
  id: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  replies?: CommentItem[];
  isDeleted?: boolean;
  isRead?: boolean;
  siteName?: string;
};
