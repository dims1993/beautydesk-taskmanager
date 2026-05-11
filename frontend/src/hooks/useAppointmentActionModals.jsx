import { useState, useCallback } from "react";
import {
  PaymentModal,
  EditAppointmentModal,
  ArchiveAppointmentModal,
} from "../components/modals/AppointmentModals.jsx";
import { totalPriceForAppointment } from "../utils/appointmentServices";

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
      const price = totalPriceForAppointment(appo, safeServices);
      setSelectedAppo({ ...appo, price });
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
        onRequestCompleteCita={() => {
          if (!selectedAppo) return;
          const price = totalPriceForAppointment(selectedAppo, safeServices);
          setSelectedAppo({ ...selectedAppo, price });
          setModalType("payment");
        }}
        onRequestArchive={() => setModalType("archive")}
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
