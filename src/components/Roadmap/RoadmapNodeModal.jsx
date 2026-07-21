// Phase 11: Create/edit node modal. Wraps shared/Modal.jsx with size="lg".
// Props: { isOpen, onClose, parentNodeId, node }
import Modal from '../shared/Modal';
export default function RoadmapNodeModal({ isOpen, onClose, parentNodeId = null, node = null }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={node ? 'Edit Node' : 'Create Node'} size="lg">
      {/* Phase 11 implementation */}
    </Modal>
  );
}
