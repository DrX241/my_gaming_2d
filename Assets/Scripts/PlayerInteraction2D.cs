using UnityEngine;
using UnityEngine.UI;

public class PlayerInteraction2D : MonoBehaviour
{
    [SerializeField] private float interactionRadius = 1.25f;
    [SerializeField] private LayerMask interactableLayer;
    [SerializeField] private Text messageText;
    [SerializeField] private string defaultMessage = "Explore la pièce...";

    private void Start()
    {
        if (messageText != null)
        {
            messageText.text = defaultMessage;
        }
    }

    private void Update()
    {
        if (Input.GetKeyDown(KeyCode.E))
        {
            TryInteract();
        }
    }

    private void TryInteract()
    {
        Collider2D hit = Physics2D.OverlapCircle(transform.position, interactionRadius, interactableLayer);

        if (hit != null && hit.TryGetComponent(out InteractableObject interactable))
        {
            SetMessage(interactable.Description);
        }
        else
        {
            SetMessage("Il n'y a rien à observer ici.");
        }
    }

    private void SetMessage(string message)
    {
        if (messageText != null)
        {
            messageText.text = message;
        }
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.cyan;
        Gizmos.DrawWireSphere(transform.position, interactionRadius);
    }
}
