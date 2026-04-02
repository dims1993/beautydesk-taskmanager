import { useState, useCallback } from "react";
import {
  PaymentModal,
  EditAppointmentModal,
  ArchiveAppointmentModal,
} from "../components/modals/AppointmentModals.jsx";

/**
 * Shared appointment actions: edit, payment (complete), archive — same modals as AppointmentList.
 * @param onRefresh — called after a successful edit (reload appointments list).
 */
export function useAppointmentActionModals(
  services,
  onUpdateStatus,
  onRefresh,
) {
  const refresh = typeof onRefresh === "function" ? onRefresh : () => {};
  const safeServices = Array.isArray(services) ? services : [];
  const [selectedAppo, setSelectedAppo] = useState(null);
  const [modalType, setModalType] = useState(null);

  const closeModal = useCallback(() => {
    setSelectedAppo(null);
    setModalType(null);
  }, []);

  const openEdit = useCallback((appo) => {
    setSelectedAppo(appo);
    setModalType("edit");
  }, []);

  const openPayment = useCallback(
    (appo) => {
      const service = safeServices.find(
        (s) => Number(s.id) === Number(appo.service_id),
      );
      setSelectedAppo({ ...appo, price: service?.price });
      setModalType("payment");
    },
    [safeServices],
  );

  const openArchive = useCallback((appo) => {
    setSelectedAppo(appo);
    setModalType("archive");
  }, []);

  const appointmentModals = (
    <>
      <EditAppointmentModal
        isOpen={modalType === "edit"}
        onClose={closeModal}
        appointment={selectedAppo}
        services={safeServices}
        onSaved={refresh}
      />
      <PaymentModal
        isOpen={modalType === "payment"}
        onClose={closeModal}
        appointment={selectedAppo}
        onConfirm={(id, price, method) => {
          onUpdateStatus(id, "completed", { price, method });
          closeModal();
        }}
      />
      <ArchiveAppointmentModal
        isOpen={modalType === "archive"}
        onClose={closeModal}
        onConfirm={() => {
          if (selectedAppo) {
            onUpdateStatus(selectedAppo.id, "cancelled");
            closeModal();
          }
        }}
      />
    </>
  );

  return { openEdit, openPayment, openArchive, appointmentModals, closeModal };
}
