using UnityEngine;

public class InteractableObject : MonoBehaviour
{
    [TextArea]
    [SerializeField] private string description = "Rien de spécial.";

    public string Description => description;
}
