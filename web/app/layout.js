import './globals.css';

export const metadata = {
  title: 'CineBook – Movie Ticket Booking & Theatre Management',
  description: 'Book movie tickets, choose your seats and manage theatre shows with CineBook.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
