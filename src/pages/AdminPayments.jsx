import React from 'react';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import PaymentReviewQueue from '../components/admin/PaymentReviewQueue.jsx';

export default function AdminPayments() {
  return (
    <AdminLayout activeTab="payments">
      <PaymentReviewQueue role="admin" />
    </AdminLayout>
  );
}
